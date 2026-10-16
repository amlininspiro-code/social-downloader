import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {validateUrl,qualities,createServer} from '../server.mjs';
test('accepts public platform URL shapes',()=>{for(const url of ['https://youtu.be/abc','https://www.youtube.com/watch?v=abc','https://www.instagram.com/reel/abc/','https://vm.tiktok.com/abc/','https://www.snapchat.com/spotlight/abc'])assert.equal(validateUrl(url),url);});
test('rejects private addresses, lookalike hosts, credentials, ports and protocols',()=>{for(const url of ['http://youtube.com/a','https://youtube.com.evil.com/a','https://127.0.0.1/','file:///etc/passwd','https://user:pass@youtube.com/a','https://youtube.com:8080/a','not a url'])assert.throws(()=>validateUrl(url));});
test('quality list excludes audio and deduplicates actual heights',()=>assert.deepEqual(qualities({formats:[{height:1080,vcodec:'h264'},{height:720,vcodec:'av1'},{height:1080,vcodec:'av1'},{height:0,vcodec:'none'}]}),[1080,720]));
test('API protects local origin and rejects unknown jobs and invalid media',async()=>{
  const server=createServer(); await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const request=(route,method='GET',headers={host:'localhost:3000'},body)=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:route,method,headers},res=>{let text='';res.on('data',d=>text+=d);res.on('end',()=>resolve({status:res.statusCode,text}));});req.on('error',reject);req.end(body);});
  try {
    assert.equal((await request('/','GET',{host:'evil.example'})).status,403);
    assert.equal((await request('/api/download','POST',{host:'localhost:3000',origin:'https://evil.example'},'{}')).status,403);
    const result=await request('/api/download','POST',{host:'localhost:3000'},'{}');assert.equal(result.status,400);assert.match(result.text,/Analyze/);
    assert.equal((await request('/api/jobs/aaaaaaaa')).status,404);
    assert.equal((await request('/')).status,200);
  } finally { await new Promise(r=>server.close(r)); }
});
