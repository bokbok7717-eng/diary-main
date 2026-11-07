/* Resolving a persisted session is a distinct state from being signed out. */
export function watchAuth(auth,notify){
  let stopped=false,initialResolved=false,pending=null;
  const emit=state=>{if(!stopped)notify(state);};
  emit({phase:'checking',user:null});
  const {data}=auth.onAuthStateChange((event,session)=>{
    const state={phase:session?.user?'signed-in':'signed-out',user:session?.user||null,event};
    if(!initialResolved){pending=state;return;}
    emit(state);
  });
  const ready=auth.getSession().then(({data,error})=>{
    if(stopped)return;
    initialResolved=true;
    if(error){emit({phase:'error',error,user:null});return;}
    const initial={phase:data.session?.user?'signed-in':'signed-out',user:data.session?.user||null,event:'INITIAL_SESSION'};
    emit(initial);
    if(pending&&pending.event!=='INITIAL_SESSION'&&
       (pending.phase!==initial.phase||pending.user?.id!==initial.user?.id))emit(pending);
    pending=null;
  },error=>{
    if(stopped)return;
    initialResolved=true;
    emit({phase:'error',error,user:null});
  });
  return {ready,stop(){stopped=true;data?.subscription?.unsubscribe();}};
}
