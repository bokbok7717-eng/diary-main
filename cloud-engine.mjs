import {mergeValues,valuesEqual,hasRecords,combinePhotos,stable} from './cloud-merge.mjs?v=20261021-1';

/* Injectable engine used by the real page and the independent two-device tests. */
export function createSyncEngine(io){
  let busy=false,queued=false,active=true,baseline=null,loaded=false,blocked=null;
  const assertActive=()=>{if(!active)throw Object.assign(new Error('계정이 변경되어 동기화를 멈췄어요.'),{cancelled:true});};
  const changed=before=>!valuesEqual(before.values,io.local().values);
  async function sync(options={}){
    if(!active)return;
    if(busy){queued=true;return;}
    busy=true;io.state({phase:'syncing'});
    try{
      if(!loaded){baseline=await io.loadBaseline();assertActive();loaded=true;}
      for(let attempt=0;attempt<4;attempt++){
        const local=io.local();
        const remote=await io.read();assertActive();
        if(options.resolve&&blocked&&remote?.version!==blocked.remote?.version){blocked={local,remote};io.state({phase:'conflict',conflicts:['새 변경을 확인한 뒤 다시 선택해주세요.']});return;}
        if(changed(local)){queued=true;continue;}
        if(!remote){
          if(baseline){io.state({phase:'conflict',reason:'missing-cloud',conflicts:[]});return;}
          if(!options.initialize){io.state({phase:'unlinked'});return;}
        }
        const b=baseline?.values??(await io.legacyBase?.(local,remote))??null;assertActive();
        const incoming=remote?.data??{format:2,values:{},photos:{}};
        const merged=remote?mergeValues(b,local.values,incoming.values,options.resolve):{values:local.values,conflicts:[]};
        if(remote&&!baseline&&!hasRecords(local.values)){merged.values=incoming.values;merged.conflicts.length=0;}
        if(merged.conflicts.length&&!options.resolve){blocked={local,remote};io.state({phase:'conflict',conflicts:merged.conflicts});return;}
        if(options.resolve){await io.recover({local,remote,baseline});assertActive();if(changed(local))continue;}
        const needsApply=!valuesEqual(merged.values,local.values);
        if(needsApply&&!io.canApply()){io.state({phase:'editing'});return;}
        let committed=remote;
        if(!remote||!valuesEqual(merged.values,incoming.values)){
          // No remote photos are downloaded here. Existing immutable paths are retained.
          const data=await io.pack({format:2,values:merged.values,photos:combinePhotos(merged.values,local,incoming)},incoming);assertActive();
          if(changed(local))continue;
          const result=await io.write(data,remote?.version??null);assertActive();
          if(!result){continue;} // A different device won the revision check. Re-read and merge.
          committed={version:result.version,data};
        }
        if(!committed)throw new Error('클라우드 저장 상태를 확인하지 못했어요.');
        // Apply synchronously after the guard. The adapter must roll back on local quota errors.
        // Never call location.reload: drafts, focus and in-memory models survive reconciliation.
        if(needsApply){
          if(!io.canApply()){io.state({phase:'editing'});return;}
          await io.apply(committed.data,()=>{assertActive();if(changed(local)||!io.canApply())throw Object.assign(new Error('편집 중인 내용을 보관하고 다음 동기화를 기다릴게요.'),{deferred:true});});assertActive();
        }
        baseline={user:io.userId,version:committed.version,values:committed.data.values,manifest:committed.data};
        await io.saveBaseline(baseline);assertActive();
        blocked=null;
        io.state({phase:'synced',version:committed.version});
        io.hydrate(committed.data); // Background photos never hold the metadata/auth lock.
        return;
      }
      io.state({phase:'pending'});
    }catch(error){if(active)io.state({phase:error.deferred?'editing':'error',error});}
    finally{busy=false;io.settled?.();if(queued&&active){queued=false;io.schedule(()=>void sync(),100);}}
  }
  return {
    sync,
    stop(){active=false;queued=false;},
    get busy(){return busy;},
    get baseline(){return baseline;},
    get conflict(){return blocked;},
    dirty(){return !baseline||!valuesEqual(io.local().values,baseline.values);}
  };
}
