export const dynamic='force-dynamic';
export async function GET(){
 const key=process.env.VWORLD_WEBGL_KEY?.trim() || process.env.VWORLD_API_KEY?.trim() || '';
 if(!key)return new Response('VWorld 지도 키가 설정되지 않았습니다.',{status:503});
 // The official WebGL SDK uses document.write; isolate it from the Next.js document.
 const sdk='https://map.vworld.kr/js/webglMapInit.js.do?'+new URLSearchParams({version:'3.0',apiKey:key});
 const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>동탄 A40 · VWorld 3D 지도</title><style>html,body,#vmap{margin:0;width:100%;height:100%;overflow:hidden}#notice{position:absolute;z-index:9999;top:12px;left:12px;background:#fff;padding:10px 14px;border-radius:8px;font:13px sans-serif;max-width:70%;box-shadow:0 2px 10px #0002}#home{position:absolute;z-index:9999;right:12px;top:12px;padding:10px;background:white;border:1px solid #ccc;border-radius:8px;cursor:pointer}</style><script src="${sdk.replaceAll('&','&amp;')}"></script></head><body><div id="vmap"></div><div id="notice" role="status">VWorld 항공영상·3D 건물을 불러오는 중입니다.</div><button id="home">동탄 단지로 이동</button><script>
var initialized=false;setTimeout(function(){if(!initialized)document.getElementById('notice').textContent='지도 연결이 지연되고 있습니다. 새로고침하거나 VWorld 서비스 상태를 확인해주세요.';},45000);
function home(){if(window.ws3d&&ws3d.viewer){var target=Cesium.Cartesian3.fromDegrees(127.1114,37.1818,65);ws3d.viewer.scene.camera.flyToBoundingSphere(new Cesium.BoundingSphere(target,160),{offset:new Cesium.HeadingPitchRange(0,-Math.PI/4,550),duration:1.2});}}

try{
 if(typeof vw==='undefined'||window.vworldIsValid==='false')throw Error('지도 SDK 인증 또는 로드 실패');
 v_protocol='https://';vworldUrl='https://map.vworld.kr';vworld2DCache='https://2d.vworld.kr/2DCache';vworldBaseMapUrl='https://cdn.vworld.kr/2d';vworldStyledMapUrl='https://2d.vworld.kr/stmap';
 vw.ws3dInitCallBack=function(){initialized=true;document.getElementById('notice').textContent='동탄 A40 · VWorld 제공 촬영 시점의 지도';var labels=ws3d.viewer.scene.primitives.add(new Cesium.LabelCollection({scene:ws3d.viewer.scene}));labels.add({position:Cesium.Cartesian3.fromDegrees(127.1114,37.1818,0),heightReference:Cesium.HeightReference.CLAMP_TO_GROUND,text:'● 동탄 A40 · 센트럴힐즈',font:'bold 16px sans-serif',fillColor:Cesium.Color.WHITE,showBackground:true,backgroundColor:Cesium.Color.fromCssColorString('#155b4d'),disableDepthTestDistance:Number.POSITIVE_INFINITY});setTimeout(home,0);};
 $.ajaxPrefilter(function(o){var u=new URL(o.url,location.href);if(u.hostname==='map.vworld.kr'&&u.pathname==='/dtkmap/vworldJson.do'){o.url='/api/admin/building-map/config';o.crossDomain=false;}});
 var options=new vw.MapOptions(vw.BasemapType.GRAPHIC,'',vw.DensityType.BASIC,vw.DensityType.BASIC,false,new vw.CameraPosition(new vw.CoordZ(127.1114,37.1818,650),new vw.Direction(0,-40,0)),new vw.CameraPosition(new vw.CoordZ(127.1114,37.1818,650),new vw.Direction(0,-40,0)));
 options.mapId='vmap'; var vmap=new vw.Map(options); vmap.start();
 document.getElementById('home').onclick=home;
 document.getElementById('notice').textContent='동탄 A40 · VWorld 제공 지도 / 건물 데이터 로딩 중';
}catch(e){document.getElementById('notice').textContent='3D 지도를 시작하지 못했습니다. VWorld WebGL 권한과 서비스 URL 설정을 확인해주세요.';}
</script></body></html>`;
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'strict-origin-when-cross-origin','X-Content-Type-Options':'nosniff'}});
}
