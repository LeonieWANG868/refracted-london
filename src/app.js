import {clamp,colours,journeyMetrics,londonDate,readData} from './journey.js';
import {createProjection} from './projection.js';
import {PROJECTION_START} from './optics.js';

async function readCityLayers() {
  async function optional(file) {
    try {
      const response=await fetch(new URL('../data/'+file,import.meta.url));
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  }
  const [district,landmarks]=await Promise.all([optional('london-district.json'),optional('landmarks.json')]);
  return {district,landmarks};
}

const $=id=>document.getElementById(id);
const stationary=matchMedia('(prefers-reduced-motion: reduce)');
const embedded=window.self!==window.top || new URLSearchParams(location.search).get('view')==='projection';

function flatScene(stage) {
  stage.classList.add('fallback');
  const beam=$('fallback-beam');
  return {
    select(){},projectionChanged(){},
    reset(){beam.style.opacity='0';},
    setJourney(_journey,metrics){
      beam.style.boxShadow='0 0 13px 3px #6dedfa,0 '+(1+metrics.separation*8)+'px 9px #e897fc';
    },
    update(progress){
      beam.style.opacity=progress===0?'0':String(1-.62*clamp((progress-PROJECTION_START)/(1-PROJECTION_START)));
      beam.style.transform='rotate(-12deg) scaleX('+clamp(progress/PROJECTION_START)+')';
    },
  };
}

function option(value,label) {return new Option(label,value);}

async function main(){
  const [data,layers]=await Promise.all([readData(),readCityLayers()]);
  const projection=createProjection($('projection'),data);
  const stage=$('stage');
  let scene;
  try {
    if (embedded) throw new Error('Use the frame-safe projection view when embedded');
    const webgl=await import('./scene.js');
    scene=webgl.createScene(stage,projection,data,layers);
  } catch {
    scene=flatScene(stage);
  }

  const from=$('origin'),to=$('destination'),generate=$('generate'),reset=$('reset');
  const status=$('status'),history=$('history'),progressBar=$('track');

  const origins=[...new Set(data.journeys.map(item=>item.from))];
  from.replaceChildren(...origins.map(code=>option(code,data.stops[code].name)));
  const recent=[];
  let active=null, progress=0, started=-1, locked=false,lastPhase=-1, previous=-1;
  let finishedAt=null, lastRender=-100, lastProjection=-100, frameId;
  const selected=()=>data.journeys.find(item=>item.from===from.value&&item.to===to.value);

  function originsChanged(event){
    const destinations=data.journeys.filter(item=>item.from===from.value).map(item=>item.to);
    const choices=destinations.map(code=>option(code,data.stops[code].name));
    if(event) choices.unshift(option('','Choose destination'));
    to.replaceChildren(...choices);
    selectionChanged();
  }

  function selectionChanged(){
    const journey=selected();
    generate.disabled=!journey||locked;
    if(!journey){
      scene.select(data.stops[from.value],null);
      for(const id of ['distance','minutes','ratio','snapshot-date','coordinates','plan-times']) $(id).textContent='—';
      $('strength').value='—';
      $('meter').setAttribute('aria-valuenow',0);
      $('meter').firstElementChild.style.transform='scaleX(0)';
      $('legs').replaceChildren();
      status.textContent='Select a destination for this origin.';
      return;
    }
    const origin=data.stops[journey.from],destination=data.stops[journey.to];
    scene.select(origin,destination);
    const {km,ratio,separation}=journeyMetrics(journey,data.stops);
    $('distance').textContent=km.toFixed(2);
    $('minutes').textContent=journey.minutes;
    $('ratio').textContent=ratio.toFixed(2);
    $('snapshot-date').textContent='TfL snapshot · retrieved '+londonDate(journey.checkedAt);
    const amount=Math.round(separation*100);
    $('strength').value=amount+'%';
    $('meter').setAttribute('aria-valuenow',amount);
    $('meter').firstElementChild.style.transform='scaleX('+separation+')';
    const list=journey.legs.map(leg=>{
      const li=document.createElement('li'),mark=document.createElement('span');
      mark.className='leg-swatch';mark.style.setProperty('--leg',colours[leg.line]||colours.walking);
      const service=document.createElement('span');
      service.textContent=leg.name+' · '+leg.minutes+' min'+(leg.geometry==='sequence'?' (stop sequence)':'');
      li.append(mark,service);
      const stations=document.createElement('small');
      stations.className='leg-stops';
      stations.textContent=leg.stops.map(stop=>stop.name).join(' → ');
      li.append(stations);
      return li;
    });
    const changes=document.createElement('li');
    changes.className='leg-change';
    changes.textContent=journey.transfers.length
      ? 'Change at '+journey.transfers.map(item=>item.name).join(', ') : 'Direct service';
    $('legs').replaceChildren(...list,changes);
    const coordinates=stop=>stop.name+' '+stop.lat.toFixed(6)+', '+stop.lon.toFixed(6);
    $('coordinates').textContent=coordinates(origin)+' to '+coordinates(destination)+' (lat, lon).';
    $('plan-times').textContent=journey.depart.slice(11,16)+'–'+journey.arrive.slice(11,16)+' London time · '+londonDate(journey.depart)+'.';
    if(!locked) status.textContent='Select a journey and generate its light path.';
  }

  function archive(){
    history.replaceChildren(...[...recent].reverse().map(item=>{
      const li=document.createElement('li');
      li.textContent=data.stops[item.from].name+' → '+data.stops[item.to].name;
      return li;
    }));
    $('count').value=String(recent.length);
  }

  function setControls(value){
    locked=value;from.disabled=value;to.disabled=value;generate.disabled=value||!selected();
  }

  function showPhase(phase){
    if(phase===lastPhase)return;
    lastPhase=phase;

    if(phase===0)status.textContent='Injecting a light pulse…';
    if(phase===1)status.textContent='Separating colour by travel time per kilometre…';
    if(phase===2)status.textContent='Drawing the verified TfL route…';
  }

  function progressTo(value){
    progress=value;
    showPhase(value===0?-1:value<.21?0:value<PROJECTION_START?1:2);
    progressBar.firstElementChild.style.transform='scaleX('+value+')';
    progressBar.setAttribute('aria-valuenow',Math.round(value*100));
  }

  function drawRoute(time) {
    const amount=clamp((progress-PROJECTION_START)/(1-PROJECTION_START));
    const age=finishedAt===null?0:(time-finishedAt)/1000;
    projection.draw(recent,active?.journey,amount,time/1000,age,!stationary.matches);
    scene.projectionChanged();
    lastProjection=time;
  }

  function end(time){
    finishedAt=time;
    const journey=active.journey;
    const already=recent.findIndex(item=>item.id===journey.id);
    if(already>=0)recent.splice(already,1);
    recent.push(journey);
    archive();
    setControls(false);
    status.textContent=journey.legs.some(leg=>leg.geometry==='sequence')
      ? 'Route projected. Dashed links follow verified stop order.'
      : 'TfL route projected. Generate another journey to build the archive.';
  }

  function frame(time){
    if(locked&&active){
      if(started<0)started=time;
      const elapsed=time-started;
      const value=stationary.matches?1:clamp(elapsed/active.metrics.durationMs);
      if(value!==previous){progressTo(value);previous=value;}
      if(value>=1)end(time);
    }
    const revealEnded=finishedAt!==null&&lastProjection<finishedAt;
    if(active&&progress>=PROJECTION_START&&(revealEnded||(time-lastProjection>32&&(locked||!stationary.matches))))drawRoute(time);
    if(locked||time-lastRender>30){
      scene.update(progress,time,stationary.matches||embedded);lastRender=time;
    }
    frameId=requestAnimationFrame(frame);
  }

  from.addEventListener('change',originsChanged);
  to.addEventListener('change',selectionChanged);
  $('journey-form').addEventListener('submit',event=>{
    event.preventDefault();
    const journey=selected();
    if(locked||!journey)return;
    $('history').closest('details').open=false;
    active={journey,metrics:journeyMetrics(journey,data.stops)};
    started=-1;previous=-1;finishedAt=null;
    setControls(true);reset.disabled=false;
    scene.setJourney(journey,active.metrics);
    progressTo(.001);drawRoute(performance.now());
  });
  reset.addEventListener('click',()=>{
    active=null;
    recent.splice(0);
    started=-1;previous=-1;finishedAt=null;
    scene.reset();progressTo(0);drawRoute(performance.now());archive();setControls(false);reset.disabled=true;
    status.textContent='Projection reset. Choose a journey to begin again.';
  });

  const cityMethod=layers.district
    ? layers.district.metadata.total+' mapped building volumes in a 1.4 × 1.4 km district across Westminster and the South Bank. OSM footprints are extruded from Environment Agency LiDAR heights with the same scale on all three axes. The roof cloud uses measured LiDAR points. Modelled dots trace building outlines and façades. A magnified view glides between Westminster Abbey and the London Eye along the bottom of the glass. The birds are artistic animation.'
    : 'The district model is unavailable in this session.';
  const modelMethod=layers.district&&layers.landmarks?' Westminster Abbey, the Palace of Westminster, Elizabeth Tower and the London Eye use geographically anchored Codriver models at the same scale.':'';
  $('city-method').textContent=cityMethod+modelMethod;
  $('source-note').textContent=['Data provided by Transport for London. Thames geometry: Greater London Authority.',
    layers.district?.metadata.credit,layers.landmarks?.credit,
  ].filter(Boolean).join(' ');
  $('osm-credit').hidden=!layers.district;
  $('source-list').replaceChildren(...[...data.sources,...(layers.district?.metadata.sources || []),...(layers.landmarks?.sources||[])].map(source=>{
    const li=document.createElement('li'),link=document.createElement('a');
    link.href=source.url;link.textContent=source.name;link.target='_blank';link.rel='noopener noreferrer';
    li.append(link,source.checkedAt?' · retrieved '+londonDate(source.checkedAt):'');
    return li;
  }));
  stage.querySelector('canvas.webgl')?.addEventListener('webglcontextlost',()=>{
    scene.dispose?.();
    stage.classList.remove('webgl-ready');
    scene=flatScene(stage);
    if(active)scene.setJourney(active.journey,active.metrics);
    if(!locked)status.textContent='2D projection is ready.';
  },{once:true});
  $('open-method').addEventListener('click',()=>$('method').showModal());
  $('open-method').disabled=false;
  setControls(false);originsChanged();progressTo(0);drawRoute(performance.now());
  if(stage.classList.contains('fallback'))status.textContent='Projection view ready. Select a journey to begin.';
  frameId=requestAnimationFrame(frame);
  addEventListener('pagehide',event=>{
    if(event.persisted)return;
    cancelAnimationFrame(frameId);
    scene.dispose?.();
  },{once:true});
}

main().catch(error=>{
  $('status').textContent=error.message+' Reload the page to try again.';
});
