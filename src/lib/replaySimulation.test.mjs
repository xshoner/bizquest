import test from 'node:test';
import assert from 'node:assert/strict';
import { replaySimulation } from './replaySimulation.js';

test('24개월 기록 재생은 이벤트 순서·피벗·희석을 유지하고 원본을 변경하지 않는다',()=>{
  const events=Array.from({length:24},(_,i)=>({month:i+1,event:{id:'RECORDED',factor:'F01',rates:{보통:0}}}));
  const room={teams:{A:{initialCapital:100000000,currentAsset:999999999,assetHistory:[],pivotModifiers:{scenarioId:'professional_management',appliedAtMonth:12,equityDilutionRate:15}}},eventHistory:events,simulationSettings:{}};
  const before=JSON.stringify(room);
  const teams=replaySimulation(room);
  assert.equal(teams.A.currentAsset,127500000);
  assert.equal(teams.A.assetHistory.length,26);
  assert.equal(teams.A.assetHistory[13].pivot,true);
  assert.equal(teams.A.assetHistory.at(-1).dilution,true);
  assert.equal(JSON.stringify(room),before);
});

test('누락되거나 중복된 월 기록은 자동 복구를 중단한다',()=>{
  assert.throws(()=>replaySimulation({eventHistory:[],teams:{}}),/완전하지/);
  const event={id:'RECORDED',factor:'F01',rates:{보통:0}};
  assert.throws(()=>replaySimulation({eventHistory:Array.from({length:24},()=>({month:1,event})),teams:{}}),/완전하지/);
});
