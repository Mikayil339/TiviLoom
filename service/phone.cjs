'use strict';
// Best-effort same-LAN QR server. LG webOS TV does NOT officially support inbound
// HTTP servers (LG developer forum). Expose start errors rather than fake a link.
// Node 8.12 compatible: no optional chaining, for-await or Object.fromEntries.
var http=require('http'),os=require('os'),crypto=require('crypto'),fs=require('fs'),path=require('path');
var MAX=30*1024*1024,TTL=10*60*1000;
function privateAddress(raw){var ip=String(raw||'').replace(/^::ffff:/,'');return ip==='::1'||/^127\./.test(ip)||/^10\./.test(ip)||/^192\.168\./.test(ip)||/^169\.254\./.test(ip)||/^172\.(1[6-9]|2\d|3[01])\./.test(ip)||/^(fc|fd|fe80):/i.test(ip);}
function addresses(){var out=[],cards;try{cards=os.networkInterfaces();}catch(e){return out;}Object.keys(cards).forEach(function(key){(cards[key]||[]).forEach(function(a){if((a.family==='IPv4'||a.family===4)&&!a.internal&&privateAddress(a.address))out.push(a.address);});});return out.filter(function(ip,i){return out.indexOf(ip)===i;});}
function createPhoneBridge(options){options=options||{};var srv=null,session=null,sockets=[],now=options.now||Date.now,page=options.page||fs.readFileSync(path.join(__dirname,'phone.html'),'utf8');
 function json(res,code,obj){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));}
 function authorizedToken(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));}
 function check(){if(!session||now()>session.expires)throw Error('QR session has expired. Open it again on TV.');return session;}
 function read(req){return new Promise(function(resolve,reject){var chunks=[],bytes=0;req.on('data',function(part){bytes+=part.length;if(bytes>MAX){reject(Error('Payload larger than 30MB.'));req.destroy();return;}chunks.push(part);});req.on('end',function(){resolve(Buffer.concat(chunks).toString('utf8'));});req.on('error',reject);});}
 function handler(req,res){(async function(){var s=check(),remote=req.socket.remoteAddress,host=req.headers.host;
  if(!privateAddress(remote))return json(res,403,{error:'Same LAN only.'});
  if(s.hosts.indexOf(host)<0)return json(res,403,{error:'Unexpected host.'});
  if(req.headers.origin&&req.headers.origin!=='http://'+host)return json(res,403,{error:'Origin rejected.'});
  var u=new (require('url').URL)(req.url,'http://'+host);
  if(req.method==='GET'&&u.pathname==='/phone'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'"});return res.end(page);}
  if(!authorizedToken(req.headers['x-tiviloom-pair'],s.token))return json(res,403,{error:'Invalid QR token.'});
  if(req.method==='GET'&&u.pathname==='/api/status'){var job=s.jobs[u.searchParams.get('id')];return json(res,job?200:404,job?{status:job.status,message:job.message||''}:{error:'Request not found.'});}
  if(req.method==='GET'&&u.pathname==='/api/backup'){if(!s.backupReady)return json(res,409,{error:'Backup is not ready.'});res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','Content-Disposition':'attachment; filename="TiviLoom-backup.json"'});return res.end(s.backup.join(''));}
  if(req.method!=='POST'||String(req.headers['content-type']||'').split(';')[0]!=='application/json')return json(res,415,{error:'JSON POST required.'});
  var data=JSON.parse(await read(req)),payload=null,content='';
  if(u.pathname==='/api/playlist'){
    var loc=new (require('url').URL)(data.url||'');if(!/^https?:$/.test(loc.protocol)||loc.username||loc.password||String(data.url).length>4000)throw Error('Use a valid HTTP(S) playlist link.');
    if(data.epgURL){var e=new (require('url').URL)(data.epgURL);if(!/^https?:$/.test(e.protocol)||String(data.epgURL).length>4000)throw Error('Invalid EPG URL.');}
    payload={url:data.url,name:String(data.name||'Phone playlist').slice(0,80),epgURL:data.epgURL||''};
  }else if(u.pathname==='/api/restore'){if(data.format!=='TiviLoom')throw Error('Invalid backup.');content=JSON.stringify(data);}else return json(res,404,{error:'Not found.'});
  if(Object.keys(s.jobs).some(function(id){return ['pending','working'].indexOf(s.jobs[id].status)>=0;}))return json(res,429,{error:'Finish the previous request first.'});
  var id=crypto.randomBytes(12).toString('hex');s.jobs[id]={id:id,type:payload?'playlist':'restore',payload:payload,text:content,status:'pending'};return json(res,200,{id:id,message:'Confirm on TV.'});
 })().catch(function(e){if(!res.headersSent)json(res,400,{error:e.message||'Phone request failed.'});});}
 async function stop(){var old=srv;srv=null;var oldSession=session;session=null;if(oldSession&&oldSession.timer)clearTimeout(oldSession.timer);options.onActive&&options.onActive(false);if(old)await new Promise(function(resolve){old.close(function(){resolve();});sockets.forEach(function(socket){socket.destroy();});sockets=[];});}
 async function start(){await stop();var ips=options.addresses||addresses();var onlyLoopback=!ips.length;if(onlyLoopback)ips=['127.0.0.1'];var server=http.createServer(handler);srv=server;server.on('connection',function(socket){sockets.push(socket);socket.on('close',function(){var n=sockets.indexOf(socket);if(n>=0)sockets.splice(n,1);});});
  try{await new Promise(function(resolve,reject){server.once('error',reject);server.listen(options.port===undefined?19789:options.port,options.host||'0.0.0.0',resolve);});}catch(e){srv=null;throw Error('TV blocked local HTTP server: '+e.message);}
  var port=server.address().port,token=crypto.randomBytes(24).toString('hex'),hosts=ips.concat(['127.0.0.1']).map(function(ip){return ip+':'+port;});
  session={token:token,expires:now()+TTL,hosts:hosts,jobs:{},backup:[],backupReady:false};session.timer=setTimeout(stop,TTL);if(session.timer.unref)session.timer.unref();options.onActive&&options.onActive(true);
  return {returnValue:true,token:token,urls:ips.map(function(ip){return 'http://'+ip+':'+port+'/phone#'+token;}),expires:session.expires,cloud:false,localOnly:onlyLoopback};}
 async function api(method,payload){payload=payload||{};if(method==='phoneStart')return start();var s=check();if(!authorizedToken(payload.token,s.token))throw Error('Invalid phone session or expired QR.');
  if(method==='phoneStop'){await stop();return {returnValue:true};}
  if(method==='phonePoll'){var job=Object.keys(s.jobs).map(function(key){return s.jobs[key];}).filter(function(j){return j.status==='pending';})[0];if(!job)return {returnValue:true,job:null};job.status='working';return {returnValue:true,job:{id:job.id,type:job.type,payload:job.payload,chunks:Math.ceil(job.text.length/8192)}};}
  if(method==='phoneRead'){var j=s.jobs[payload.id];if(!j)throw Error('No phone request.');return {returnValue:true,text:j.text.slice(payload.index*8192,(payload.index+1)*8192)};}
  if(method==='phoneComplete'){var done=s.jobs[payload.id];if(!done)throw Error('Phone request not found.');done.status=payload.ok?'done':'failed';done.message=String(payload.message||'').slice(0,256);done.text='';return {returnValue:true};}
  if(method==='phoneBackupBegin'){s.backup=[];s.backupReady=false;return {returnValue:true};}
  if(method==='phoneBackupPart'){if(typeof payload.text!=='string'||payload.text.length>8192||payload.index!==s.backup.length)throw Error('Invalid backup chunk.');s.backup.push(payload.text);if(s.backup.join('').length>MAX)throw Error('Backup is too large.');return {returnValue:true};}
  if(method==='phoneBackupEnd'){JSON.parse(s.backup.join(''));s.backupReady=true;return {returnValue:true};}
  throw Error('Unknown QR operation.');}
 return {start:start,stop:stop,api:api};}
module.exports={createPhoneBridge:createPhoneBridge,privateAddress:privateAddress,addresses:addresses};
