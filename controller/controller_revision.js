// Fingerprint executable controller source once per process, separate from settings.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),hash=crypto.createHash('sha256');
for(const name of fs.readdirSync(__dirname).filter(n=>n.endsWith('.js')).sort()){hash.update(name);hash.update(fs.readFileSync(path.join(__dirname,name)));}
for(const name of ['mining.json','survival-progression.json']){hash.update(name);hash.update(fs.readFileSync(path.join(__dirname,'../config',name)));}
module.exports=hash.digest('hex').slice(0,16);
