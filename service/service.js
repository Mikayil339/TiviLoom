'use strict';
var Service=require('webos-service');
var createSourceAPI=require('./source.cjs').createSourceAPI;
var service=new Service('com.tiviloom.app.source');
var api=createSourceAPI({phone:{onActive:require('./lifecycle.cjs').phoneActivity(service.activityManager)}});
['hashPIN','verifyPIN','ping','fetchSource','fetchImage','probeMedia','readSource','releaseSource','phoneStart','phonePoll','phoneRead','phoneComplete','phoneStop','phoneBackupBegin','phoneBackupPart','phoneBackupEnd'].forEach(function(method){
  service.register(method,function(message){
    api(method,message.payload,message.sender).then(function(result){message.respond(result);},function(error){
      message.respond({returnValue:false,errorCode:1,errorText:error.message||'Source request failed.'});
    });
  });
});
