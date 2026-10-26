import {parseM3U} from './core.mjs';self.onmessage=e=>{try{self.postMessage({result:parseM3U(e.data.text,e.data.base)});}catch(error){self.postMessage({error:error.message});}};
