/* Resolving a persisted session is a distinct state from being signed out. */
export function watchAuth(auth,notify){
  let generation=0,stopped=false;
  const emit=state=>{if(!stopped)notify(state);};
  emit({phase:'checking',user:null});
  const {data}=auth.onAuthStateChange((event,session)=>{
    // Supabase callbacks remain synchronous. Sync work is scheduled by the caller.
    generation++;
    emit({phase:session?.user?'signed-in':'signed-out',user:session?.user||null,event});
  });
  const initial=generation;
  const ready=auth.getSession().then(({data,error})=>{
    if(stopped||generation!==initial)return;
    if(error){emit({phase:'error',error,user:null});return;}
    emit({phase:data.session?.user?'signed-in':'signed-out',user:data.session?.user||null,event:'INITIAL_SESSION'});
  },error=>{if(generation===initial)emit({phase:'error',error,user:null});});
  return {ready,stop(){stopped=true;data?.subscription?.unsubscribe();}};
}
