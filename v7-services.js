/* FitSync v7 — production cloud + AI service layer. */
(function(){
  const url = String(window.FITSYNC_SUPABASE_URL || '').trim();
  const key = String(window.FITSYNC_SUPABASE_KEY || '').trim();
  const configured = /^https:\/\/[^\s/]+\.supabase\.co(?:\/)?$/.test(url) && /^sb_(publishable|anon)_/.test(key) && !key.includes('YOUR_');
  let client = null;
  if(configured && window.supabase?.createClient){
    client = window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  }
  window.FitSyncCloud = {
    enabled: !!client,
    client,
    async signUp(email,password,name){
      if(!client) return {data:null,error:new Error('FitSync cloud is not configured yet.')};
      return client.auth.signUp({email,password,options:{data:{name},emailRedirectTo:window.location.origin}});
    },
    async signIn(email,password){
      if(!client) return {data:null,error:new Error('FitSync cloud is not configured yet.')};
      return client.auth.signInWithPassword({email,password});
    },
    async signOut(){ if(client) return client.auth.signOut(); },
    async getSession(){ if(!client) return {data:{session:null},error:null}; return client.auth.getSession(); },
    async resetPassword(email){
      if(!client) return {data:null,error:new Error('FitSync cloud is not configured yet.')};
      return client.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});
    },
    async updatePassword(password){
      if(!client) return {data:null,error:new Error('FitSync cloud is not configured yet.')};
      return client.auth.updateUser({password});
    },
    onAuthStateChange(cb){ return client?.auth.onAuthStateChange(cb); },
    async loadState(userId){
      if(!client || !userId) return null;
      const {data,error}=await client.from('fit_profiles').select('state,display_name').eq('id',userId).maybeSingle();
      if(error) throw error;
      return data;
    },
    async saveState(userId,state){
      if(!client || !userId) return;
      const safeState=JSON.parse(JSON.stringify(state));
      const {error}=await client.from('fit_profiles').upsert({id:userId,display_name:safeState.user?.name||'FitSync User',state:safeState,updated_at:new Date().toISOString()});
      if(error) throw error;
    },
    async logEvent(userId,eventType,payload={}){
      if(!client || !userId) return;
      const {error}=await client.from('fit_events').insert({user_id:userId,event_type:eventType,payload});
      if(error) console.warn('FitSync event:',error.message);
    }
  };

  window.FitSyncAI = {
    enabled: true,
    async ask(question,context){
      const sessionResult=await window.FitSyncCloud.getSession();
      const token=sessionResult?.data?.session?.access_token;
      if(!token) throw new Error('Please sign in again to use Ami.');
      const r=await fetch('/api/ami',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({question,context})});
      let data={}; try{data=await r.json()}catch{}
      if(!r.ok) throw new Error(data?.error||'Ami is temporarily unavailable.');
      return data.answer;
    }
  };

  window.addEventListener('DOMContentLoaded',()=>{
    const notes=document.querySelectorAll('.demo-note');
    notes.forEach(n=>n.textContent=configured?'Secure cloud account + database sync is ready.':'Production setup required: connect Supabase before users can create accounts.');
    const badge=document.querySelector('#cloudStatus');
    if(badge){badge.textContent=configured?'☁ CLOUD READY':'SETUP REQUIRED';badge.classList.toggle('cloud-on',configured);}
  });
})();
