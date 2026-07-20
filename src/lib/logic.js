// Pure application logic — dates, study-plan engine, spaced-review scheduling,
// skill classification, AI-question validation/dedup, and Explain+ parsing.
// No DOM, storage, or React — imported by app.jsx and covered by unit tests.

const LEVELS = ["A1","A2","B1","B2","C1","C2"];

const PLAN_DAYS = 14;                       // legacy default (kept for migration)
const PLAN_DEFAULT_DURATION = 14;
const PLAN_DURATIONS = [7,10,14,21,30];     // preset target lengths, plus "custom"
const PLAN_MIN_DAYS = 1, PLAN_MAX_DAYS = 120;
// Optional review sessions (mistakes / plan revision queue). These are
// transient: they must NEVER become the resumable "Reprendre" session, so
// they can't hijack the user's real practice/plan progress.
const REVIEW_MODES = ["struggling","revision"];
const isReviewMode = (m)=>REVIEW_MODES.includes(m);

// Each practice category keeps its OWN in-progress session, keyed here, so
// starting grammar never clobbers an in-progress reading session (and back).
function sessionKeyOf(sess){ if(!sess||!sess.mode) return null; const m=sess.mode, cat=sess.cat||"all", lvl=sess.lvl||"all";
  if(m==="level") return "level:"+lvl;
  if(m==="plan"||m==="reviewdue"||m==="aibank"||m==="rapid") return m;
  return m+":"+cat; }

// Date helpers — normalised to local midnight so "day 3" never depends on
// what time of day the plan happened to be started.
function todayKey(){ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function keyToDate(k){ const [y,m,d]=k.split("-").map(Number); return new Date(y,m-1,d); }
function daysSince(k){ return Math.floor((keyToDate(todayKey())-keyToDate(k))/86400000); }

function shuffle(a){ a=[...a]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

// ===== Study-plan engine (pure) =====
// The planner never creates questions — it only spreads the EXISTING bank over
// the number of days the user picked, redistributing whatever is still
// unanswered whenever the situation changes (a missed day, a changed target).
// All functions here are pure so the behaviour is testable and predictable.
const FR_MONTHS = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
function addDaysKey(key,n){ const d=keyToDate(key); d.setDate(d.getDate()+n); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function formatDateFr(key){ const d=keyToDate(key); return d.getDate()+" "+FR_MONTHS[d.getMonth()]; }
// Split n items over `days`, as evenly as possible, remainder on the first days.
function evenSplit(n,days){ days=Math.max(1,days|0); n=Math.max(0,n|0); const base=Math.floor(n/days), r=n%days; const out=[]; for(let i=0;i<days;i++) out.push(base+(i<r?1:0)); return out; }
function clampInt(n,lo,hi){ n=Math.round(n)||0; return Math.max(lo,Math.min(hi,n)); }
// Whole days elapsed since the plan anchor, discounting any paused stretch.
function planElapsed(p){ const cur=p.pauseStart!=null?daysSince(p.pauseStart):0; return Math.max(0, daysSince(p.start)-(p.pauseAccum||0)-cur); }
// Bring a stored plan up to the current shape and the CURRENT question bank:
// completed ids that no longer exist are dropped, and `order` is rebuilt to
// contain exactly today's ids (prior order kept for stability). Completed
// progress is preserved. Safe on a legacy {start,order,completed} plan too.
function normalizePlan(plan, allIds){
  if(!plan) return null;
  const idset=new Set(allIds);
  const prevOrder=Array.isArray(plan.order)?plan.order.filter(id=>idset.has(id)):[];
  const completed=(Array.isArray(plan.completed)?plan.completed:[]).filter(id=>idset.has(id));
  const completedSet=new Set(completed);
  const seen=new Set(); const order=[];
  for(const id of prevOrder){ if(!seen.has(id)){ seen.add(id); order.push(id); } }
  for(const id of allIds){ if(!seen.has(id)){ seen.add(id); order.push(id); } }
  const revision=(Array.isArray(plan.revision)?plan.revision:[]).filter(id=>completedSet.has(id));
  return { v:2, start: plan.start||todayKey(), duration: clampInt(plan.duration||PLAN_DEFAULT_DURATION,PLAN_MIN_DAYS,PLAN_MAX_DAYS),
    order, completed, revision, pauseAccum: plan.pauseAccum||0, pauseStart: plan.pauseStart||null, today: plan.today||null };
}
// Recompute today's fixed allocation once per calendar day (or after a change
// that reset it). Returns the plan unchanged if today is already snapshotted.
function refreshPlanToday(plan){
  if(!plan||plan.pauseStart) return plan;
  const key=todayKey();
  if(plan.today && plan.today.key===key) return plan;
  const completedSet=new Set(plan.completed);
  const unanswered=plan.order.filter(id=>!completedSet.has(id));
  const daysRemaining=Math.max(1, plan.duration - planElapsed(plan));
  const assigned=Math.min(unanswered.length, Math.ceil(unanswered.length/daysRemaining));
  return { ...plan, today:{ key, assigned, doneAtStart: plan.completed.length } };
}
// Derive everything the UI needs. Pure — no side effects.
function planView(plan){
  const total=plan.order.length;
  const completedSet=new Set(plan.completed);
  const unansweredIds=plan.order.filter(id=>!completedSet.has(id));
  const completedCount=total-unansweredIds.length;
  const paused=plan.pauseStart!=null;
  const dayIndex=planElapsed(plan);
  const duration=plan.duration;
  const dayNum=Math.min(duration, dayIndex+1);
  const overdueDays=Math.max(0, (dayIndex+1)-duration);
  const daysRemaining=Math.max(1, duration-dayIndex);
  const t=(plan.today && plan.today.key===todayKey())?plan.today:null;
  const assigned=t?t.assigned:Math.min(unansweredIds.length, Math.ceil(unansweredIds.length/daysRemaining));
  const doneAtStart=t?t.doneAtStart:completedCount;
  const doneToday=Math.max(0, completedCount-doneAtStart);
  const remToday=Math.max(0, Math.min(assigned-doneToday, unansweredIds.length));
  const todayQueue=unansweredIds.slice(0, remToday);
  const finished=unansweredIds.length===0;
  const dayComplete=!finished && remToday===0;
  const nextDaysRemaining=Math.max(1, duration-(dayIndex+1));
  const nextAssigned=Math.min(unansweredIds.length, Math.ceil(unansweredIds.length/nextDaysRemaining));
  const nextQueue=unansweredIds.slice(0, nextAssigned);
  const pct=total?Math.round(completedCount/total*100):0;
  const avgPerDay=Math.ceil(unansweredIds.length/daysRemaining);
  const totalPause=(plan.pauseAccum||0)+(paused?daysSince(plan.pauseStart):0);
  const endKey=addDaysKey(plan.start, duration+totalPause);
  // Reference schedule (stable) for the day-by-day grid.
  const quotas=evenSplit(total, duration);
  let cum=0; const cumTarget=quotas.map(q=>(cum+=q));
  let progressDay=duration+1;
  for(let d=0; d<duration; d++){ if(completedCount<cumTarget[d]){ progressDay=d+1; break; } }
  const days=quotas.map((q,i)=>{
    const dnum=i+1;
    const done=completedCount>=cumTarget[i];
    const status=done?"done":(dnum===progressDay?"current":"upcoming");
    return { dayNum:dnum, quota:q, status };
  });
  return { total, completedCount, remaining:unansweredIds.length, revisionIds:plan.revision||[],
    paused, dayIndex, dayNum, duration, overdueDays, daysRemaining,
    assigned, doneToday, remToday, todayQueue, finished, dayComplete,
    nextAssigned, nextQueue, pct, avgPerDay, endKey, days, unansweredIds };
}

// ===== Study companion: skill classification + spaced review =====
// Grammar questions are mapped to a B2 "pattern" (skill) read-only, from the
// rule text and — more reliably — the shape of the options (a set of
// prepositions, pronouns, connectors…). This never edits the question bank.
const _acc = s => String(s==null?"":s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
const PREP_SET = new Set("a,au,aux,en,du,de,des,dans,sur,sous,par,pour,avec,chez,vers,entre,contre,sans,selon,malgre,jusqu'a".split(","));
const CONN_SET = new Set("mais,donc,car,or,cependant,pourtant,neanmoins,toutefois,alors,puisque,comme,afin,tandis,quoique,neanmoins".split(","));
const RELP_SET = new Set("qui,que,dont,ou,lequel,laquelle,lesquels,lesquelles,auquel,duquel,quoi".split(","));
const OBJP_SET = new Set("le,la,les,lui,leur,l',en,y,me,te,se,nous,vous".split(","));
const GRAMMAR_SKILL_RULES = [
  ["subjunctive","Subjonctif",/subjonctif/],
  ["conditional","Conditionnel & hypothèse",/conditionnel|hypoth[eè]se|regret|\bsi\b.{0,30}(imparfait|plus-que-parfait)/],
  ["past-agreement","Accord du participe passé",/accord du participe|participe pass[ée].{0,20}accord|s'accorde avec/],
  ["reported-speech","Discours rapporté",/discours (rapporte|indirect)|style indirect/],
  ["gerund","Gérondif & participe présent",/gerondif|participe present/],
  ["passive","Voix passive & impersonnel",/voix passive|\bpassif\b|tournure impersonnelle/],
  ["comparatives","Comparatifs & superlatifs",/comparatif|superlatif|\bmeilleur|\bmieux\b/],
  ["negation","Négation & restriction",/negation|restriction|ne\b.{0,8}\b(que|guere|aucun|jamais|personne|rien|plus|nul)\b|\bni\b.{0,6}\bni\b/],
  ["future","Futur",/futur (simple|anterieur|proche)/],
  ["time-expressions","Expressions de temps",/\bdepuis\b|\bil y a\b|\bpendant\b|duree|expression de temps/],
  ["tenses","Temps du passé",/imparfait|passe compose|plus-que-parfait|passe simple|anteriorit/],
];
function classifyGrammarSkill(q){
  const hay=_acc((q.rule||"")+" "+(q.sentence||""));
  for(const [key,label,re] of GRAMMAR_SKILL_RULES){ if(re.test(hay)) return {key,label}; }
  const o=(q.options||[]).map(x=>_acc(x).replace(/[.!?]/g,"").trim());
  const allIn=set=>o.length>=3&&o.every(x=>set.has(x));
  if(allIn(RELP_SET)&&o.some(x=>["dont","lequel","laquelle","ou","auquel","duquel"].includes(x))) return {key:"relative-pronouns",label:"Pronoms relatifs"};
  if(allIn(OBJP_SET)) return {key:"object-pronouns",label:"Pronoms compléments"};
  if(allIn(RELP_SET)) return {key:"relative-pronouns",label:"Pronoms relatifs"};
  if(allIn(CONN_SET)) return {key:"connectors",label:"Connecteurs logiques"};
  if(allIn(PREP_SET)) return {key:"prepositions",label:"Prépositions"};
  const r=_acc(q.rule||"");
  if(/connecteur|consequence|opposition|concession|\bbien que\b|\bcependant\b|\bgrace a\b|\bdu coup\b/.test(r)) return {key:"connectors",label:"Connecteurs logiques"};
  if(/pronom relatif|\bdont\b|\blequel\b/.test(r)) return {key:"relative-pronouns",label:"Pronoms relatifs"};
  if(/pronom|\bcod\b|\bcoi\b|remplace/.test(r)) return {key:"object-pronouns",label:"Pronoms compléments"};
  if(/preposition|pays|ville|\bau\b|\ben\b/.test(r)) return {key:"prepositions",label:"Prépositions"};
  if(/article|partitif/.test(r)) return {key:"articles",label:"Articles"};
  if(/synonyme|paronyme|collocation|mot juste|expression|\bsens\b|signifie|nuance/.test(r)) return {key:"vocabulary",label:"Vocabulaire en contexte"};
  if(/verbe|infinitif|conjug/.test(r)) return {key:"verb-forms",label:"Conjugaison & verbes"};
  return {key:"other",label:"Vocabulaire & tournures"};
}

// Spaced review (Leitner-style). Each answered question is scheduled for its
// next review; correct answers push it to a longer box, a miss resets it.

const REVIEW_INTERVALS = [1,2,4,9,18,35]; // days by box 0..5

function nextReviewEntry(prev, correct){
  const box = correct ? Math.min((prev&&prev.box||0)+1, REVIEW_INTERVALS.length-1) : 0;
  return { box, due: addDaysKey(todayKey(), REVIEW_INTERVALS[box]) };
}
function daysUntilKey(key){ return Math.round((keyToDate(key)-keyToDate(todayKey()))/86400000); }

// Resolve a saved session's id list to real questions, dropping any id that
// no longer exists (e.g. progress saved before the bank changed). Used to
// decide whether a session is actually resumable — a partially-broken order
// must never leave "Reprendre" pointing at a blank screen.
function resolveSessionOrder(order, allArr, aiBankArr){
  if(!Array.isArray(order)) return [];
  return order.map(id => (typeof id==="number") ? allArr[id] : (aiBankArr||[]).find(a=>a&&a.id===id)).filter(Boolean);
}

// ===== AI question validation & de-duplication =====
// Generated questions are UNTRUSTED model output. Before one can be shown in
// the quiz (whose renderer/grader are shared with the hand-written bank) or
// saved to the AI bank, it must match the exact shape those rely on:
//   { sentence:"… ___ …", options:[4 strings], correct:int 0-3, rule:str, why:[4] }
// Malformed output is REJECTED, never silently "repaired" — a repair could
// change which answer is correct, which is worse than a clean retry.
function stripJsonFences(txt){ return String(txt==null?"":txt).replace(/```json/gi,"").replace(/```/g,"").trim(); }
function normalizeText(s){
  return String(s==null?"":s)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g,"") // strip accents
    .replace(/[^a-z0-9]+/g," ")                       // punctuation -> space
    .trim().replace(/\s+/g," ");
}
// Deterministic gate for freshly generated questions. Returns null when valid,
// otherwise a short French reason (surfaced/retried by the caller).
function validateAiQuestion(obj){
  if(!obj||typeof obj!=="object"||Array.isArray(obj)) return "Réponse IA non structurée.";
  const sentence=typeof obj.sentence==="string"?obj.sentence.trim():"";
  if(!sentence) return "Phrase manquante.";
  if(!sentence.includes("___")) return "Aucun trou « ___ » dans la phrase.";
  if(/```|<[a-z]/i.test(sentence)) return "Formatage parasite dans la phrase.";
  if(!Array.isArray(obj.options)||obj.options.length!==4) return "Il faut exactement 4 options.";
  const opts=obj.options.map(o=>typeof o==="string"?o.trim():"");
  if(opts.some(o=>!o)) return "Une option est vide.";
  const norm=opts.map(normalizeText);
  if(new Set(norm).size!==norm.length) return "Options en double ou équivalentes.";
  if(!Number.isInteger(obj.correct)||obj.correct<0||obj.correct>3) return "Index de bonne réponse invalide.";
  if(typeof obj.rule!=="string"||!obj.rule.trim()) return "Explication manquante.";
  if(!Array.isArray(obj.why)||obj.why.length!==4) return "Le tableau « why » doit avoir 4 éléments.";
  for(let i=0;i<4;i++){
    if(i===obj.correct) continue; // why[correct] is expected to be null
    if(typeof obj.why[i]!=="string"||!obj.why[i].trim()) return "Justification manquante pour un distracteur.";
  }
  if(obj.level!=null&&!LEVELS.includes(obj.level)) return "Niveau CEFR invalide.";
  return null;
}
// Looser structural gate used when reading the bank back from localStorage,
// so a single corrupted saved item can't crash the quiz on load.
function isStoredAiQuestionUsable(obj){
  return !!obj && typeof obj==="object" && !Array.isArray(obj)
    && typeof obj.sentence==="string" && obj.sentence.includes("___")
    && Array.isArray(obj.options) && obj.options.length===4 && obj.options.every(o=>typeof o==="string" && o.trim())
    && Number.isInteger(obj.correct) && obj.correct>=0 && obj.correct<4
    && typeof obj.rule==="string"
    && Array.isArray(obj.why) && obj.why.length===4;
}
// Normalised fingerprint: same sentence + same option set + same correct
// answer => treated as a duplicate, regardless of option order or accents.
function aiSignature(obj){
  const opts=obj.options.map(normalizeText).slice().sort();
  return normalizeText(obj.sentence)+"||"+opts.join("|")+"||"+normalizeText(obj.options[obj.correct]);
}
function isDuplicateAi(obj,bank){
  const sig=aiSignature(obj);
  return (bank||[]).some(b=>{ try{ return isStoredAiQuestionUsable(b)&&aiSignature(b)===sig; }catch(e){ return false; } });
}

// ===== Explain+ (structured reading-comprehension coaching) =====
// The model is asked for JSON matching this shape. sanitizeExplainPlus
// rejects anything malformed or missing its core teaching fields outright
// rather than rendering it half-broken — the caller falls back to a plain
// message when this returns null.
const EXPLAIN_PLUS_SYSTEM = [
  "Tu es un coach de compréhension écrite pour le TCF. Ton but est d'apprendre à l'élève à PROUVER une réponse à partir du texte fourni, pas seulement de lui donner la bonne réponse.",
  "RÈGLES STRICTES :",
  "- Réponds UNIQUEMENT avec un objet JSON valide : aucun texte avant ou après, aucun markdown, aucun bloc de code, aucune balise ```.",
  "- N'utilise jamais de markdown à l'intérieur des valeurs (pas de **, pas de #, pas de listes à puces).",
  "- Sois concis : des phrases courtes, jamais de dissertation.",
  "- Chaque citation du champ \"evidence\" doit être recopiée EXACTEMENT depuis le texte fourni (mêmes mots, ponctuation, accents). N'invente jamais une citation et ne cite jamais un passage qui n'existe pas dans le texte.",
  "- Si la réponse demande de combiner plusieurs éléments du texte plutôt qu'une phrase unique explicite, mets \"reasoningType\" à \"inference\" et donne une entrée \"evidence\" par élément combiné. Sinon mets \"reasoningType\" à \"direct\".",
  "- Explique le malentendu précis de l'élève dans \"whyYourAnswerIsWrong\" (pas une remarque générique).",
  "- Quand c'est pertinent, précise dans \"classification.skill\" si l'information relève du fait, de l'opinion, de la description, de la critique, de la cause, de la conséquence, du but ou de l'inférence.",
  "- Identifie un piège TCF réutilisable dans \"trap\" (label court + explication).",
  "- Donne 1 à 3 conseils de stratégie d'examen réutilisables dans \"strategy\".",
  "- Ne liste dans \"vocabulary\" que du vocabulaire réellement difficile (0 à 4 mots). Un tableau vide est préférable à des mots triviaux.",
  "- \"memoryTip\" doit être UNE SEULE phrase concise.",
  "Réponds avec exactement cette forme JSON :",
  '{"reasoningType":"direct","evidence":[{"quote":"...","explanation":"..."}],"correctionSummary":"...","whyYourAnswerIsWrong":"...","trap":{"label":"...","explanation":"..."},"strategy":["..."],"vocabulary":[{"term":"...","definitionFr":"...","translationEn":"...","example":"..."}],"memoryTip":"...","classification":{"skill":"...","difficulty":"B2","mistakeType":"..."}}',
].join("\n");

function sanitizeExplainPlus(raw){
  let obj;
  try{
    const cleaned=String(raw).replace(/```json/gi,"").replace(/```/g,"").trim();
    // Tolerate stray prose around the JSON by extracting the outermost object.
    const start=cleaned.indexOf("{"), end=cleaned.lastIndexOf("}");
    const jsonStr=(start>=0&&end>start)?cleaned.slice(start,end+1):cleaned;
    obj=JSON.parse(jsonStr);
  }catch(e){ return null; }
  if(!obj||typeof obj!=="object") return null;

  const evidence=Array.isArray(obj.evidence)
    ? obj.evidence.filter(e=>e&&typeof e.quote==="string"&&e.quote.trim()&&typeof e.explanation==="string").map(e=>({quote:e.quote.trim(),explanation:e.explanation.trim()}))
    : [];
  const correctionSummary=typeof obj.correctionSummary==="string"?obj.correctionSummary.trim():"";
  const whyYourAnswerIsWrong=typeof obj.whyYourAnswerIsWrong==="string"?obj.whyYourAnswerIsWrong.trim():"";

  // These three are the actual teaching content — without them there's
  // nothing worth showing, so the whole response is treated as unusable.
  if(evidence.length===0||!correctionSummary||!whyYourAnswerIsWrong) return null;

  const trap=(obj.trap&&typeof obj.trap.label==="string"&&obj.trap.label.trim())?{label:obj.trap.label.trim(),explanation:typeof obj.trap.explanation==="string"?obj.trap.explanation.trim():""}:null;
  const strategy=Array.isArray(obj.strategy)?obj.strategy.filter(s=>typeof s==="string"&&s.trim()).map(s=>s.trim()).slice(0,4):[];
  const vocabulary=Array.isArray(obj.vocabulary)
    ? obj.vocabulary.filter(v=>v&&typeof v.term==="string"&&v.term.trim()).map(v=>({
        term:v.term.trim(),
        definitionFr:typeof v.definitionFr==="string"?v.definitionFr.trim():"",
        translationEn:typeof v.translationEn==="string"?v.translationEn.trim():"",
        example:typeof v.example==="string"?v.example.trim():"",
      })).slice(0,6)
    : [];
  const memoryTip=typeof obj.memoryTip==="string"?obj.memoryTip.trim():"";
  const classification=(obj.classification&&typeof obj.classification==="object")?{
    skill:typeof obj.classification.skill==="string"?obj.classification.skill.trim():"",
    difficulty:typeof obj.classification.difficulty==="string"?obj.classification.difficulty.trim():"",
    mistakeType:typeof obj.classification.mistakeType==="string"?obj.classification.mistakeType.trim():"",
  }:{skill:"",difficulty:"",mistakeType:""};
  const reasoningType=obj.reasoningType==="inference"?"inference":"direct";

  return { reasoningType, evidence, correctionSummary, whyYourAnswerIsWrong, trap, strategy, vocabulary, memoryTip, classification };
}

export {
  LEVELS, PLAN_DAYS, PLAN_DEFAULT_DURATION, PLAN_DURATIONS, PLAN_MIN_DAYS, PLAN_MAX_DAYS, REVIEW_MODES, isReviewMode, sessionKeyOf, todayKey, keyToDate, daysSince, shuffle, addDaysKey, formatDateFr, evenSplit, clampInt, planElapsed, normalizePlan, refreshPlanToday, planView, classifyGrammarSkill, REVIEW_INTERVALS, nextReviewEntry, daysUntilKey, resolveSessionOrder, stripJsonFences, normalizeText, validateAiQuestion, isStoredAiQuestionUsable, aiSignature, isDuplicateAi, EXPLAIN_PLUS_SYSTEM, sanitizeExplainPlus
};
