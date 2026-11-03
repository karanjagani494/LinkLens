import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {analyse,validateRequest} from '../server/analysis/analyse';
const manifestText=readFileSync('evaluation/manifest.json','utf8');const manifest=JSON.parse(manifestText);
let tp=0,fp=0,fn=0,tn=0,inconclusive=0,completedCoverage=0;
const results=manifest.cases.map((fixture:{id:string;url:string;expected:string})=>{
 const input={url:fixture.url,inputKind:'url' as const,inspectRedirects:false,checkReputation:false};
 if(!validateRequest(input))throw Error('Invalid synthetic fixture: '+fixture.id);
 const report=analyse(input),predicted=report.verdict==='suspicious',expected=fixture.expected==='suspicious';
 if(predicted&&expected)tp++;else if(predicted)fp++;else if(expected)fn++;else tn++;
 if(report.verdict==='insufficient_evidence')inconclusive++;if(report.coverage==='complete')completedCoverage++;
 return {id:fixture.id,expected:fixture.expected,actual:report.verdict,ruleIds:report.findings.map(f=>f.id),matchesExpected:fixture.expected===report.verdict};
});
const output={corpus:manifest.version,corpusSha256:createHash('sha256').update(manifestText).digest('hex'),scope:'Synthetic structural-policy conformance only. Not real-world phishing detection accuracy.',provenance:manifest.provenance,limitations:manifest.limitations,versions:analyse({url:'https://example.com',inputKind:'url',inspectRedirects:false,checkReputation:false}).versions,total:results.length,confusionMatrix:{truePositive:tp,falsePositive:fp,falseNegative:fn,trueNegative:tn},indicatorPrecision:tp+fp?tp/(tp+fp):null,indicatorRecall:tp+fn?tp/(tp+fn):null,inconclusiveCount:inconclusive,completeCoverageCount:completedCoverage,completeCoverageFraction:completedCoverage/results.length,results};
mkdirSync('docs/evaluation',{recursive:true});writeFileSync('docs/evaluation/synthetic-policy.json',JSON.stringify(output,null,2)+'\n');
console.log(`Synthetic policy corpus: ${results.filter((r:{matchesExpected:boolean})=>r.matchesExpected).length}/${results.length} expected verdicts; ${inconclusive} inconclusive reports. No real-world performance claim.`);
if(results.some((r:{matchesExpected:boolean})=>!r.matchesExpected))process.exitCode=1;
