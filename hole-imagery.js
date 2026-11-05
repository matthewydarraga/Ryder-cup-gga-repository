/* USGS National Map imagery; hole locations supplied by OpenGolfAPI. */
(()=>{'use strict';
const cache=new Map();
function point(x){const lat=x?.lat??x?.latitude,lon=x?.lng??x?.lon??x?.longitude;return typeof lat==='number'&&typeof lon==='number'&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=85&&Math.abs(lon)<=180?{lat,lon}:null;}
async function detail(id){if(!cache.has(id))cache.set(id,fetch('https://api.opengolfapi.org/api/v1/courses/'+encodeURIComponent(id)).then(r=>{if(!r.ok)throw Error('Hole map service unavailable.');return r.json();}).then(raw=>raw.data||raw.course||raw).catch(e=>{cache.delete(id);throw e;}));return cache.get(id);}
async function mount(host,id,hole){
 host.innerHTML='<p class="aerial-message" role="status">Loading hole imagery…</p>';
 try{
 if(!id)throw Error('Select a course and tees to see hole imagery.');
 const d=await detail(id);if(!host.isConnected)return;
 const hs=d.holes_data;if(!Array.isArray(hs)||hs.length!==18||hs.some((h,i)=>h.number!==i+1))throw Error('The API does not provide a reliable map for this course.');
 const green=point(hs[hole-1]?.green?.center);if(!green)throw Error('Hole coordinates are not available from the API.');
 let span=.004;const image=document.createElement('img');image.alt='USGS aerial imagery around hole '+hole+' green';image.className='aerial-photo';
 const marker=document.createElement('span');marker.className='aerial-green';marker.textContent='⚑';marker.title='API green center';
 const controls=document.createElement('div');controls.className='aerial-zoom';
 const draw=()=>{const dx=span/Math.cos(green.lat*Math.PI/180),bbox=[green.lon-dx/2,green.lat-span/2,green.lon+dx/2,green.lat+span/2].join(',');image.src='https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/export?bbox='+bbox+'&bboxSR=4326&imageSR=3857&size=700,700&format=jpg&f=image';};
 for(const [label,factor]of [['+',.65],['−',1.5]]){const b=document.createElement('button');b.type='button';b.className='btn btn-secondary';b.textContent=label;b.setAttribute('aria-label',label==='+'?'Zoom in aerial map':'Zoom out aerial map');b.onclick=e=>{e.stopPropagation();span=Math.max(.0008,Math.min(.02,span*factor));draw();};controls.appendChild(b);}
 const credit=document.createElement('a');credit.href='https://www.usgs.gov/the-national-map-data-delivery';credit.target='_blank';credit.rel='noopener';credit.className='aerial-credit';credit.textContent='USGS / USDA aerial imagery · API green center';
 image.onerror=()=>{if(host.isConnected)host.innerHTML='<p class="aerial-message">Imagery is unavailable here. Hole scoring remains available.</p>';};
 host.replaceChildren(image,marker,controls,credit);draw();
 }catch(e){if(host.isConnected){host.replaceChildren();const p=document.createElement('p');p.className='aerial-message';p.textContent=e.message;host.appendChild(p);}}
}
window.GGA_HOLE_IMAGERY={mount};
})();
