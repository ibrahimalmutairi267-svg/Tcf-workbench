import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createRoot } from "react-dom/client";

import { QUESTIONS } from "./data/questions.js";
import { READING } from "./data/reading.js";
import {
  LEVELS, PLAN_DAYS, PLAN_DEFAULT_DURATION, PLAN_DURATIONS, PLAN_MIN_DAYS, PLAN_MAX_DAYS, REVIEW_MODES, isReviewMode, sessionKeyOf, todayKey, keyToDate, daysSince, shuffle, addDaysKey, formatDateFr, evenSplit, clampInt, planElapsed, normalizePlan, refreshPlanToday, planView, classifyGrammarSkill, REVIEW_INTERVALS, nextReviewEntry, daysUntilKey, resolveSessionOrder, stripJsonFences, normalizeText, validateAiQuestion, isStoredAiQuestionUsable, aiSignature, isDuplicateAi, EXPLAIN_PLUS_SYSTEM, sanitizeExplainPlus
} from "./lib/logic.js";


// ===== Design tokens =====
// All values are CSS custom properties (see <style> :root / [data-theme=dark]),
// so every screen re-themes automatically when the theme attribute flips.
const BLUE = "var(--blue)";
const BLUE_DARK = "var(--blue-dark)";
const INK = "var(--ink)";
const GREY = "var(--grey)";        // AA-safe secondary text
const GREY_SOFT = "var(--grey-soft)"; // decorative-only (icons, dots), not small text
const LINE = "var(--line)";
const BG = "var(--bg)";
const CARD = "var(--card)";
const GREEN = "var(--green)";
const RED = "var(--red)";
const GREEN_BG = "var(--green-bg)", GREEN_TEXT = "var(--green-text)";
const RED_BG = "var(--red-bg)", RED_TEXT = "var(--red-text)";
const AMBER_BG = "var(--amber-bg)", AMBER_TEXT = "var(--amber-text)";
const QUOTE_BG = "var(--quote-bg)", QUOTE_TEXT = "var(--quote-text)";
const CODE_BG = "var(--code-bg)";
const TRACK_BG = "var(--track)";
const EVIDENCE_BG = "var(--evidence-bg)", EVIDENCE_BORDER = "var(--evidence-border)";
const GRADIENT_BRAND = "var(--gradient-brand)";
const OVERLAY = "var(--overlay)", OVERLAY_SOLID = "var(--overlay-solid)";
const SHADOW_XS = "var(--shadow-xs)";
const SHADOW_CARD = "var(--shadow-card)";
const SHADOW_CARD_LG = "var(--shadow-card-lg)";
const SHADOW_BUBBLE_USER = "var(--shadow-bubble-user)";
const SHADOW_BUBBLE_AI = "var(--shadow-bubble-ai)";
const SHADOW_BLUE_LG = "var(--shadow-blue-lg)";
const INK_SOFT = "var(--ink-soft)"; // secondary body text, darker/denser than GREY

// CEFR level palette — cool/easy through warm/hard
const LEVEL_COLORS = { A1:"var(--level-a1-text)", A2:"var(--level-a2-text)", B1:"var(--level-b1-text)", B2:"var(--level-b2-text)", C1:"var(--level-c1-text)", C2:"var(--level-c2-text)" };
const LEVEL_BG     = { A1:"var(--level-a1-bg)", A2:"var(--level-a2-bg)", B1:"var(--level-b1-bg)", B2:"var(--level-b2-bg)", C1:"var(--level-c1-bg)", C2:"var(--level-c2-bg)" };
const RADIUS = "var(--radius)";

const THEME_KEY = "tcf_theme_v1";
function loadThemePref(){ try{ return localStorage.getItem(THEME_KEY)||"system"; }catch(e){ return "system"; } }
function applyTheme(mode){
  try{ localStorage.setItem(THEME_KEY, mode); }catch(e){}
  const dark = mode==="dark" || (mode==="system" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark?"dark":"light");
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute("content", dark?"#161618":"#ffffff");
}

const STORE_KEY = "tcf_progress_v1";
const WORKER_KEY = "tcf_worker_url";
// Built-in AI backend — every visitor gets the tutor/AI features with no setup.
// A custom URL saved in Settings overrides this.
const DEFAULT_WORKER = "https://tcf.b-r-h-oomy-ih.workers.dev";
const AI_BANK_KEY = "tcf_ai_bank_v1";
const AI_BANK_MAX = 300; // cap so localStorage doesn't grow without bound
const PLAN_KEY = "tcf_plan_v1";

function saveProgress(d){ try{ localStorage.setItem(STORE_KEY,JSON.stringify(d)); }catch(e){} }
function loadProgress(){ try{ const r=localStorage.getItem(STORE_KEY); const o=r?JSON.parse(r):null; if(!o) return null;
  if(!o.sessionMap||typeof o.sessionMap!=="object"){ // migrate legacy single-session shape
    const map={}; if(o.session){ const k=sessionKeyOf(o.session); if(k){ map[k]=o.session; o.lastKey=k; } } o.sessionMap=map;
  }
  delete o.session; if(!("lastKey" in o)) o.lastKey=null; return o;
}catch(e){ return null; } }
function getWorkerUrl(){ try{ return localStorage.getItem(WORKER_KEY)||DEFAULT_WORKER; }catch(e){ return DEFAULT_WORKER; } }
function setWorkerUrl(u){ try{ u?localStorage.setItem(WORKER_KEY,u):localStorage.removeItem(WORKER_KEY); }catch(e){} }
function isCustomWorker(){ try{ return !!localStorage.getItem(WORKER_KEY); }catch(e){ return false; } }
function loadAiBank(){ try{ const r=localStorage.getItem(AI_BANK_KEY); const arr=r?JSON.parse(r):[]; return Array.isArray(arr)?arr.filter(isStoredAiQuestionUsable):[]; }catch(e){ return []; } }
function saveAiBank(arr){ try{ localStorage.setItem(AI_BANK_KEY,JSON.stringify(arr)); }catch(e){} }
function loadPlan(){ try{ const r=localStorage.getItem(PLAN_KEY); return r?JSON.parse(r):null; }catch(e){ return null; } }
function savePlan(p){ try{ p?localStorage.setItem(PLAN_KEY,JSON.stringify(p)):localStorage.removeItem(PLAN_KEY); }catch(e){} }

// In-app "reduce motion" override — lets someone turn animations off from
// inside the app even when they can't (or haven't) changed the OS setting.
const REDUCE_MOTION_KEY = "tcf_reduce_motion_v1";
function loadReduceMotion(){ try{ return localStorage.getItem(REDUCE_MOTION_KEY)==="1"; }catch(e){ return false; } }
function saveReduceMotion(on){ try{ on?localStorage.setItem(REDUCE_MOTION_KEY,"1"):localStorage.removeItem(REDUCE_MOTION_KEY); }catch(e){} }
function prefersReducedMotion(){
  return loadReduceMotion() || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}


const emptyStats = { lifetimeCorrect:0, lifetimeAnswered:0, sessions:0, masteredIds:[], strugglingIds:[], bestPct:0 };

const REVIEW_KEY = "tcf_review_v1";
function loadReview(){ try{ const r=localStorage.getItem(REVIEW_KEY); const o=r?JSON.parse(r):{}; return (o&&typeof o==="object"&&!Array.isArray(o))?o:{}; }catch(e){ return {}; } }
function saveReview(m){ try{ localStorage.setItem(REVIEW_KEY,JSON.stringify(m)); }catch(e){} }


// Topic pool for AI-generated grammar questions, to force variety instead of
// letting the model default to its single most likely pattern (in practice,
// "si" hypothetical clauses, almost every time, if left unconstrained).
const GRAMMAR_TOPICS = [
  "prépositions devant un pays, une ville ou un lieu (à/au/en/du)",
  "pronoms compléments (COD, COI : le/la/les/lui/leur, en, y)",
  "subjonctif après une expression de volonté, doute ou nécessité",
  "conditionnel présent ou passé (hypothèse avec si, regret, suggestion polie)",
  "connecteurs logiques de cause, conséquence ou opposition (grâce à, à cause de, bien que, cependant, du coup)",
  "expressions de temps et de durée (depuis, il y a, dans, pendant, en)",
  "choix du mot juste entre deux adjectifs ou noms proches en sens (paronymes ou synonymes piégeurs)",
  "collocations et expressions figées (verbe + nom qui vont naturellement ensemble)",
  "voix passive ou tournure impersonnelle",
  "gérondif ou participe présent",
  "pronoms relatifs (qui, que, dont, où, lequel)",
  "accord du participe passé",
  "comparatifs et superlatifs",
  "discours rapporté (style indirect)",
  "négation ou restriction (ne...que, ne...guère, ne...aucun)",
  "futur simple ou futur antérieur",
  "prépositions de verbes (verbe + à / de + infinitif)",
];
const AI_CONTEXTS = ["au travail","en voyage","à l'université","dans la vie quotidienne","en ligne ou sur les réseaux sociaux","en famille","dans les médias","à propos de l'environnement","dans le milieu associatif ou culturel"];
let recentAiTopics = []; // module-level, no need to trigger re-renders
function pickGrammarTopic(){
  const choices = GRAMMAR_TOPICS.filter(t=>!recentAiTopics.includes(t));
  const pool = choices.length ? choices : GRAMMAR_TOPICS;
  const topic = pool[Math.floor(Math.random()*pool.length)];
  recentAiTopics = [topic, ...recentAiTopics].slice(0,5);
  return topic;
}


// Upgraded generation prompt: an expert TCF item-writer + reviewer, tuned for
// authentic B2 "Structure de la langue" items with plausible distractors and
// a single defensible answer. Grammar-only — reading generation is unchanged
// (it does not exist in this app).
function buildGrammarPrompt(topic,context){
  return [
    "Tu es un concepteur expert d'items du TCF et relecteur d'examen.",
    "Ta tâche : créer UNE question de « Structure de la langue » (phrase à trou, niveau B2) qui pourrait réellement figurer dans un TCF officiel.",
    "Objectif : une question authentique — ni devinette, ni piège artificiel, ni vocabulaire obscur. La difficulté doit venir de la maîtrise de la grammaire et du sens en contexte.",
    "",
    "POINT TESTÉ (obligatoire) : "+topic+".",
    "CONTEXTE de la phrase : "+context+". Varie le vocabulaire, le sujet et la longueur de la phrase à chaque génération.",
    "N'utilise PAS de proposition en « Si » (hypothèse) sauf si le point testé est explicitement le conditionnel — c'est un piège trop facile et surexploité.",
    "",
    "RÈGLES IMPÉRATIVES :",
    "- Exactement UNE seule réponse est incontestablement correcte.",
    "- Chaque distracteur est plausible (erreur réaliste d'apprenant) mais clairement faux selon la règle de langue.",
    "- Pas d'options équivalentes ni de doublons ; pas de « toutes les réponses » ni « aucune des réponses ».",
    "- La bonne réponse n'est ni plus longue ni plus détaillée que les autres ; aucune incohérence grammaticale ne doit trahir la bonne option.",
    "- N'exige aucune connaissance extérieure ; n'invente aucune information.",
    "- Niveau B2 : ne rends pas la question difficile par du vocabulaire rare, mais par une distinction fine.",
    "",
    "RELECTURE INTERNE (à faire avant de répondre, sans jamais la montrer) : vérifie qu'une seule réponse est défendable, que chaque distracteur est réfutable, que le niveau reste B2, que la formulation ressemble au style TCF, et que la grammaire est correcte. Si un point échoue, recommence en interne.",
    "",
    "FORMAT DE SORTIE : réponds UNIQUEMENT avec du JSON brut, sans markdown, sans texte avant ou après :",
    '{"sentence":"phrase avec ___ à l\'emplacement du trou","options":["..","..","..",".."],"correct":<index 0-3 de la bonne option>,"rule":"règle expliquée en français, concise","why":["raison pour laquelle cette option est fausse","..","..",".."],"level":"B2","skill":"'+topic+'"}',
    "Mets null à la place de la bonne réponse dans « why ». « why » doit contenir exactement 4 éléments, alignés un à un sur « options ».",
  ].join("\n");
}

// Talks to your own Cloudflare Worker, which holds the Anthropic API key
// server-side and forwards the request. See worker.js.
async function askClaude(system, messages, maxTokens){
  const url=getWorkerUrl(); if(!url) throw new Error("NO_WORKER");
  let r;
  try{
    r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system,messages,max_tokens:maxTokens||1024})});
  }catch(e){ throw new Error("Impossible de joindre le serveur. Vérifie l'adresse du Worker."); }
  let data; try{ data=await r.json(); }catch(e){ throw new Error("Réponse invalide du serveur ("+r.status+")."); }
  if(!r.ok||data.error) throw new Error(data.error||("Erreur API ("+r.status+")"));
  return data.text;
}


function Spinner(){ return <span className="spin">◠</span>; }

// ===== Icon set (feather-style, single stroke, 1.5–2px) =====
function Icon({ children, size=20, stroke=2, style, ...props }){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{display:"block",flexShrink:0,...style}} {...props}>{children}</svg>;
}
function ChevronRight(props){ return <Icon {...props}><path d="M9 6l6 6-6 6"/></Icon>; }
function ChevronLeft(props){ return <Icon {...props}><path d="M15 6l-6 6 6 6"/></Icon>; }
function GearIcon(props){ return <Icon {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></Icon>; }
function SparkleIcon(props){ return <Icon {...props}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/><circle cx="12" cy="12" r="2.5"/></Icon>; }
function BookIcon(props){ return <Icon {...props}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></Icon>; }
function TypeIcon(props){ return <Icon {...props}><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></Icon>; }
function TargetIcon(props){ return <Icon {...props}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></Icon>; }
function RefreshIcon(props){ return <Icon {...props}><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 4 21 9 16 9"/></Icon>; }
function CheckIcon(props){ return <Icon {...props}><polyline points="20 6 9 17 4 12"/></Icon>; }
function XIcon(props){ return <Icon {...props}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></Icon>; }
function MessageIcon(props){ return <Icon {...props}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></Icon>; }
function ZapIcon(props){ return <Icon {...props}><polygon points="13 2 3 14 11 14 10 22 21 10 13 10 13 2"/></Icon>; }
function SunIcon(props){ return <Icon {...props}><circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></Icon>; }
function MoonIcon(props){ return <Icon {...props}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></Icon>; }
function InfoIcon(props){ return <Icon {...props}><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16.5"/><circle cx="12" cy="7.8" r="1.1" fill="currentColor" stroke="none"/></Icon>; }

// Wordmark used in nav bars: a small rounded badge + label
// Lightweight formatter for tutor replies: **bold**, bullet/numbered lists, and
// French examples in «guillemets» get highlighted so they stand out from prose.
function inline(text, keyBase){
  const out=[]; let k=0;
  const re=/(\*\*[^*]+\*\*|«[^»]+»|`[^`]+`)/g;
  let last=0, m;
  while((m=re.exec(text))!==null){
    if(m.index>last) out.push(text.slice(last,m.index));
    const tok=m[0];
    if(tok.startsWith("**")) out.push(<strong key={keyBase+"-b"+(k++)} style={{fontWeight:650,color:INK}}>{tok.slice(2,-2)}</strong>);
    else if(tok.startsWith("«")) out.push(<span key={keyBase+"-q"+(k++)} style={{background:QUOTE_BG,color:QUOTE_TEXT,borderRadius:5,padding:"1px 5px",fontWeight:500}}>{tok}</span>);
    else out.push(<code key={keyBase+"-c"+(k++)} style={{background:CODE_BG,borderRadius:5,padding:"1px 5px",fontSize:"0.92em"}}>{tok.slice(1,-1)}</code>);
    last=m.index+tok.length;
  }
  if(last<text.length) out.push(text.slice(last));
  return out;
}
function RichText({ text }){
  const lines=String(text).split("\n");
  return (
    <div>
      {lines.map((ln,i)=>{
        const t=ln.trim();
        if(!t) return <div key={i} style={{height:8}}/>;
        const heading=/^#{1,6}\s+/.test(t);
        const bullet=/^[-•*]\s+/.test(t);
        const num=/^\d+[.)]\s+/.test(t);
        if(heading){
          const body=t.replace(/^#{1,6}\s+/,"").replace(/\*\*/g,"");
          return <div key={i} style={{fontWeight:650,color:INK,fontSize:15.5,margin:i===0?"0 0 8px":"14px 0 8px"}}>{body}</div>;
        }
        if(bullet||num){
          const body=t.replace(/^[-•*]\s+/,"").replace(/^\d+[.)]\s+/,"");
          const marker=num?t.match(/^\d+/)[0]+"." : "•";
          return (
            <div key={i} style={{display:"flex",gap:9,marginBottom:5,alignItems:"flex-start"}}>
              <span style={{color:BLUE,fontWeight:600,flexShrink:0,minWidth:num?16:8,fontSize:14,lineHeight:"1.55em"}}>{marker}</span>
              <span style={{flex:1}}>{inline(body,"l"+i)}</span>
            </div>
          );
        }
        return <div key={i} style={{marginBottom:6}}>{inline(t,"l"+i)}</div>;
      })}
    </div>
  );
}

// Highlights AI-supplied evidence quotes inside a passage, without ever
// touching the original question data or using dangerouslySetInnerHTML.
// Matching is exact (case, punctuation and accents included) — a quote
// that isn't found verbatim in the passage is simply left unhighlighted;
// it still appears in the evidence list itself. Repeated identical text is
// handled deterministically: every exact occurrence of a matched quote is
// highlighted, and overlapping ranges keep whichever was found first.
function highlightPassage(passage, quotes){
  const text=String(passage||"");
  const cleanQuotes=(quotes||[]).map(q=>String(q||"").trim()).filter(Boolean);
  if(cleanQuotes.length===0) return [text];

  const ranges=[];
  cleanQuotes.forEach(quote=>{
    let from=0;
    while(from<=text.length){
      const at=text.indexOf(quote,from);
      if(at===-1) break;
      ranges.push({start:at,end:at+quote.length});
      from=at+quote.length;
    }
  });
  if(ranges.length===0) return [text];

  ranges.sort((a,b)=>a.start-b.start||a.end-b.end);
  const accepted=[];
  let cursor=0;
  for(const r of ranges){
    if(r.start<cursor) continue; // overlaps an earlier, already-accepted range
    accepted.push(r);
    cursor=r.end;
  }

  const out=[];
  let pos=0;
  accepted.forEach((r,i)=>{
    if(r.start>pos) out.push(text.slice(pos,r.start));
    out.push(
      <mark key={"ev"+i} style={{background:EVIDENCE_BG,color:"inherit",borderRadius:3,padding:"0 1px",boxDecorationBreak:"clone",WebkitBoxDecorationBreak:"clone",borderBottom:"2px solid "+EVIDENCE_BORDER}}>
        {text.slice(r.start,r.end)}
      </mark>
    );
    pos=r.end;
  });
  if(pos<text.length) out.push(text.slice(pos));
  return out;
}

// Structured "Explain+" result for reading questions: the correct answer
// and its textual evidence are always visible (never hidden behind a
// disclosure); the trap/strategy/vocabulary/classification enrichment is
// real teaching content but secondary, so it lives behind one native
// <details> — keyboard accessible for free, same pattern already used for
// Settings' "Avancé" panel.
function ExplainPlusPanel({ data, q, selected }){
  const selectedText=q.options[selected];
  const hasEnrichment = !!data.trap || data.strategy.length>0 || data.vocabulary.length>0 || !!(data.classification.skill||data.classification.difficulty||data.classification.mistakeType);
  const h4Style={fontSize:12.5,fontWeight:700,color:GREY,textTransform:"uppercase",letterSpacing:"0.05em",margin:"0 0 8px"};
  return (
    <div style={{marginTop:6}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
        <SparkleIcon size={14} style={{color:BLUE}}/>
        <span style={{fontSize:12,fontWeight:700,color:BLUE,textTransform:"uppercase",letterSpacing:"0.05em"}}>Explication détaillée</span>
        {data.reasoningType==="inference"&&<span style={{fontSize:11,fontWeight:600,color:AMBER_TEXT,background:AMBER_BG,padding:"2px 8px",borderRadius:6}}>Déduction</span>}
      </div>

      <h4 style={h4Style}>Preuve dans le texte</h4>
      <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:18}}>
        {data.evidence.map((e,i)=>(
          <div key={i} style={{background:CARD,border:"1px solid "+LINE,borderRadius:12,padding:"12px 14px"}}>
            <div style={{fontSize:14.5,lineHeight:1.5,color:INK,fontStyle:"italic",marginBottom:e.explanation?6:0}}>« {e.quote} »</div>
            {e.explanation&&<div style={{fontSize:13.5,lineHeight:1.5,color:INK_SOFT}}>{e.explanation}</div>}
          </div>
        ))}
      </div>

      <h4 style={h4Style}>Pourquoi c'est la bonne réponse</h4>
      <p style={{fontSize:14.5,lineHeight:1.6,color:INK,margin:"0 0 18px"}}>{data.correctionSummary}</p>

      <h4 style={h4Style}>Pourquoi ta réponse était fausse</h4>
      <p style={{fontSize:14.5,lineHeight:1.6,color:INK,margin:"0 0 16px"}}><strong style={{fontWeight:600,color:RED_TEXT}}>{selectedText}</strong> — {data.whyYourAnswerIsWrong}</p>

      {data.memoryTip&&(
        <div style={{display:"flex",gap:9,alignItems:"flex-start",background:QUOTE_BG,borderRadius:12,padding:"12px 14px",marginBottom:hasEnrichment?14:0}}>
          <span aria-hidden="true" style={{flexShrink:0}}>💡</span>
          <span style={{fontSize:13.5,lineHeight:1.5,color:QUOTE_TEXT,fontWeight:500}}>{data.memoryTip}</span>
        </div>
      )}

      {hasEnrichment&&(
        <details>
          <summary style={{fontSize:13.5,color:GREY,cursor:"pointer",padding:"6px 2px",listStyle:"none",display:"flex",alignItems:"center",gap:6}}>
            <GearIcon size={13}/>Piège, stratégie et vocabulaire
          </summary>
          <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:16}}>
            {data.trap&&(
              <div>
                <h4 style={h4Style}>Piège TCF{data.trap.label?" — "+data.trap.label:""}</h4>
                {data.trap.explanation&&<p style={{fontSize:13.5,lineHeight:1.55,color:INK_SOFT,margin:0}}>{data.trap.explanation}</p>}
              </div>
            )}
            {data.strategy.length>0&&(
              <div>
                <h4 style={h4Style}>Stratégie d'examen</h4>
                <ul style={{margin:0,paddingLeft:20,display:"flex",flexDirection:"column",gap:5}}>
                  {data.strategy.map((s,i)=><li key={i} style={{fontSize:13.5,lineHeight:1.5,color:INK_SOFT}}>{s}</li>)}
                </ul>
              </div>
            )}
            {data.vocabulary.length>0&&(
              <div>
                <h4 style={h4Style}>Vocabulaire</h4>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {data.vocabulary.map((v,i)=>(
                    <div key={i} style={{fontSize:13.5,lineHeight:1.5}}>
                      <strong style={{color:INK,fontWeight:600}}>{v.term}</strong>
                      {v.translationEn&&<span style={{color:GREY}}> ({v.translationEn})</span>}
                      {v.definitionFr&&<div style={{color:INK_SOFT,marginTop:2}}>{v.definitionFr}</div>}
                      {v.example&&<div style={{color:GREY,fontStyle:"italic",marginTop:2}}>« {v.example} »</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(data.classification.skill||data.classification.difficulty||data.classification.mistakeType)&&(
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {data.classification.skill&&<span style={{fontSize:11.5,fontWeight:600,color:GREY,background:TRACK_BG,padding:"3px 9px",borderRadius:6}}>{data.classification.skill}</span>}
                {data.classification.difficulty&&<span style={{fontSize:11.5,fontWeight:600,color:GREY,background:TRACK_BG,padding:"3px 9px",borderRadius:6}}>{data.classification.difficulty}</span>}
                {data.classification.mistakeType&&<span style={{fontSize:11.5,fontWeight:600,color:GREY,background:TRACK_BG,padding:"3px 9px",borderRadius:6}}>{data.classification.mistakeType}</span>}
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

function Wordmark({ size=30 }){
  return (
    <div style={{display:"flex",alignItems:"center",gap:9}}>
      <div style={{width:size,height:size,borderRadius:size*0.32,background:GRADIENT_BRAND,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:size*0.42,fontWeight:700,letterSpacing:"-0.03em",flexShrink:0}}>B2</div>
      <span style={{fontSize:18,fontWeight:600,letterSpacing:"-0.02em",color:INK}}>TCF</span>
    </div>
  );
}

// Reusable Apple-style primary button (pill)
function PillButton({ onClick, children, kind="primary", disabled, style }){
  const base={ border:"none", borderRadius:980, padding:"12px 22px", fontSize:16, fontWeight:500, letterSpacing:"-0.01em", ...style };
  const kinds={
    primary:{ background:disabled?GREY_SOFT:BLUE, color:"#fff" },
    secondary:{ background:"transparent", color:BLUE, border:"1px solid "+BLUE },
    grey:{ background:TRACK_BG, color:INK },
    ghost:{ background:"transparent", color:BLUE, padding:"8px 4px" },
  };
  return <button className="pill-btn" onClick={onClick} disabled={disabled} style={{...base,...kinds[kind]}}>{children}</button>;
}

// Small uppercase eyebrow used to label dashboard/settings sections —
// gives scannable structure without another bordered box.
function SectionLabel({ children, icon:Icon }){
  return (
    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12,paddingLeft:2}}>
      {Icon&&<Icon size={13} style={{color:GREY}}/>}
      <span style={{fontSize:12,fontWeight:700,color:GREY,textTransform:"uppercase",letterSpacing:"0.06em"}}>{children}</span>
    </div>
  );
}

// Circular score visualization for the Result screen. Animates its sweep
// on mount unless the user has asked for reduced motion.
function ScoreRing({ pct, size=172, strokeWidth=13 }){
  const [drawn,setDrawn]=useState(0);
  useEffect(()=>{
    if(prefersReducedMotion()){ setDrawn(pct); return; }
    const t=setTimeout(()=>setDrawn(pct),60);
    return ()=>clearTimeout(t);
  },[pct]);
  const r=(size-strokeWidth)/2;
  const c=2*Math.PI*r;
  const offset=c-(Math.max(0,Math.min(100,drawn))/100)*c;
  const color = pct>=80?GREEN:pct>=60?BLUE:AMBER_TEXT;
  return (
    <div style={{position:"relative",width:size,height:size,margin:"0 auto"}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={TRACK_BG} strokeWidth={strokeWidth}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          style={{transition:"stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}>
        <div style={{fontSize:size*0.26,fontWeight:700,letterSpacing:"-0.03em",color:INK,lineHeight:1}}>{pct}%</div>
      </div>
    </div>
  );
}

function App(){
  const ALL = [...QUESTIONS.map(q=>({...q,type:q.type||"grammar"})), ...READING.map(q=>({...q,type:"reading"}))].map((q,i)=>({...q,id:i}));
  const GRAMMAR_COUNT = QUESTIONS.length;
  const READING_COUNT = READING.length;
  const levelCounts = useMemo(()=>ALL.reduce((m,q)=>(q.level&&(m[q.level]=(m[q.level]||0)+1),m),{}),[]);
  const [questions,setQuestions]=useState([]);
  const [current,setCurrent]=useState(0);
  const [selected,setSelected]=useState(null);
  const [score,setScore]=useState(0);
  const [wrong,setWrong]=useState([]);
  const [phase,setPhase]=useState("home");
  const [mode,setMode]=useState("all");
  const [stats,setStats]=useState(emptyStats);
  const [sessionMap,setSessionMap]=useState({}); // per-category resumable sessions
  const [lastKey,setLastKey]=useState(null);     // most recently active session (hero "Reprendre")
  const [sessKey,setSessKey]=useState(null);     // key of the session currently being played
  const hasSession = !!(lastKey && sessionMap[lastKey]);
  const writeSessions=(map,last,ns)=>{ const st=ns||stats; setSessionMap(map); setLastKey(last); saveProgress({stats:st, sessionMap:map, lastKey:last}); };
  const [aiQuestion,setAiQuestion]=useState(null);
  const [aiLoading,setAiLoading]=useState(false);
  const [aiError,setAiError]=useState("");
  const genLock=useRef(false); // hard guard so a rapid double-click can't launch two generations
  const [deepExpl,setDeepExpl]=useState("");
  const [deepExplStructured,setDeepExplStructured]=useState(null);
  const [deepLoading,setDeepLoading]=useState(false);
  // Every place that resets the free-text deep explanation must also clear
  // the structured one, or a stale evidence panel (with quotes from a
  // different passage) could bleed into the next question.
  const resetDeepExpl=useCallback(()=>{ setDeepExpl(""); setDeepExplStructured(null); },[]);
  const [workerUrlInput,setWorkerUrlInput]=useState(isCustomWorker()?getWorkerUrl():"");
  const [showTutor,setShowTutor]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [aiBank,setAiBank]=useState([]);
  const [plan,setPlan]=useState(null);
  const [customDaysOpen,setCustomDaysOpen]=useState(false);
  const [customDays,setCustomDays]=useState("");
  const [themeMode,setThemeMode]=useState(loadThemePref);
  const [reduceMotion,setReduceMotion]=useState(loadReduceMotion);
  const [review,setReview]=useState({}); // spaced-review schedule: qid -> {box,due}
  const hasWorker=true; // built-in worker ships with the app
  const mainRef=useRef(null);
  const screenKey=showSettings?"settings":showTutor?"tutor":phase;

  useEffect(()=>{
    const s=loadProgress();
    const bank=loadAiBank(); setAiBank(bank); setReview(loadReview());
    if(s){
      setStats(s.stats||emptyStats);
      // Only offer "Reprendre" if the saved session still resolves to real
      // questions with a valid position; otherwise drop it so a stale session
      // can't leave the resume button pointing at nothing.
      // Keep only sessions that still resolve to real questions (drops stale
      // ones so "Reprendre" can't land on a blank screen).
      const map=s.sessionMap||{}; const valid={};
      for(const k in map){ if(map[k]&&resolveSessionOrder(map[k].order, ALL, bank).length>0) valid[k]=map[k]; }
      const last=(s.lastKey&&valid[s.lastKey])?s.lastKey:(Object.keys(valid)[0]||null);
      setSessionMap(valid); setLastKey(last);
      // Canonicalise storage (drops any legacy single-session field and stale keys).
      saveProgress({stats:s.stats||emptyStats, sessionMap:valid, lastKey:last});
    }
    const rawPlan=loadPlan(); if(rawPlan){ const np=refreshPlanToday(normalizePlan(rawPlan, ALL.map(x=>x.id))); setPlan(np); savePlan(np); }
  },[]);

  useEffect(()=>{
    saveReduceMotion(reduceMotion);
    document.documentElement.setAttribute("data-reduce-motion", reduceMotion?"true":"false");
  },[reduceMotion]);

  // Move focus to the new screen's heading on every navigation so keyboard
  // and screen-reader users land somewhere meaningful instead of on <body>.
  useEffect(()=>{ mainRef.current?.focus({preventScroll:true}); },[screenKey]);

  // Global keyboard shortcuts: Escape backs out of overlays/screens.
  useEffect(()=>{
    function onKeyDown(e){
      if(e.key!=="Escape") return;
      if(showTutor){ setShowTutor(false); return; }
      if(showSettings){ setShowSettings(false); return; }
      if(phase==="review"){ setPhase("result"); return; }
      if(phase==="quiz"&&selected===null){ setAiQuestion(null); setPhase("home"); }
    }
    window.addEventListener("keydown",onKeyDown);
    return ()=>window.removeEventListener("keydown",onKeyDown);
  },[showTutor,showSettings,phase,selected]);

  // Keep the <html data-theme> attribute (set synchronously pre-paint by the
  // inline head script) in sync with in-app changes, and follow the OS if
  // the user hasn't overridden it.
  useEffect(()=>{
    applyTheme(themeMode);
    if(themeMode!=="system"||!window.matchMedia) return;
    const mq=window.matchMedia("(prefers-color-scheme: dark)");
    const onChange=()=>applyTheme("system");
    mq.addEventListener?mq.addEventListener("change",onChange):mq.addListener(onChange);
    return ()=>{ mq.removeEventListener?mq.removeEventListener("change",onChange):mq.removeListener(onChange); };
  },[themeMode]);

  // ===== Study plan =====
  // The plan spreads the EXISTING bank over a user-chosen number of days and
  // redistributes what's left whenever a day is missed or the target changes.
  // planView() (pure) derives every number the UI shows.
  const pv = useMemo(()=> plan ? planView(plan) : null, [plan]);

  // Snapshot today's allocation once per calendar day so the day's target is
  // stable even as questions get answered. Guarded on the date key → no loop.
  useEffect(()=>{
    if(!plan || plan.pauseStart) return;
    if(plan.today && plan.today.key===todayKey()) return;
    const np=refreshPlanToday(plan);
    if(np!==plan){ setPlan(np); savePlan(np); }
  },[plan]);

  const persistPlan=(p)=>{ setPlan(p); savePlan(p); };
  const startPlan=(duration=PLAN_DEFAULT_DURATION)=>{
    const p={ v:2, start: todayKey(), duration: clampInt(duration,PLAN_MIN_DAYS,PLAN_MAX_DAYS),
      order: shuffle(ALL.map(x=>x.id)), completed:[], revision:[], pauseAccum:0, pauseStart:null, today:null };
    persistPlan(refreshPlanToday(p));
  };
  // Only remaining unanswered questions are re-spread; completed never change.
  const changePlanDuration=(duration)=>{
    if(!plan) return;
    persistPlan(refreshPlanToday({ ...plan, duration: clampInt(duration,PLAN_MIN_DAYS,PLAN_MAX_DAYS), today:null }));
  };
  const pausePlan=()=>{ if(!plan||plan.pauseStart) return; persistPlan({ ...plan, pauseStart: todayKey() }); };
  const resumePlan=()=>{ if(!plan||!plan.pauseStart) return; const add=daysSince(plan.pauseStart); persistPlan(refreshPlanToday({ ...plan, pauseStart:null, pauseAccum:(plan.pauseAccum||0)+add, today:null })); };
  // Re-anchor the schedule to today, keeping all completed progress & revision.
  const restartPlan=()=>{ if(!plan) return; persistPlan(refreshPlanToday({ ...plan, start: todayKey(), pauseAccum:0, pauseStart:null, today:null })); };
  const abandonPlan=()=>{ setPlan(null); savePlan(null); };

  const startPool=(pool,m)=>{
    if(!pool.length) return;
    const review=isReviewMode(m);
    const key=review?null:sessionKeyOf({mode:m});
    setMode(m); setSessKey(key); setQuestions(pool); setCurrent(0); setSelected(null); setScore(0); setWrong([]); resetDeepExpl(); setAiQuestion(null); setPhase("quiz");
    // A review session runs in-memory only; it neither becomes a resumable
    // session nor disturbs any already saved.
    if(!review){ const sess={order:pool.map(x=>x.id),current:0,score:0,wrong:[],mode:m,cat:"all",lvl:"all"}; writeSessions({...sessionMap,[key]:sess}, key); }
  };
  const startPlanSession=()=>{ if(pv) startPool(pv.todayQueue.map(id=>ALL[id]).filter(Boolean),"plan"); };
  const startContinueAhead=()=>{ if(pv) startPool(pv.nextQueue.map(id=>ALL[id]).filter(Boolean),"plan"); };
  const startRevisionSession=()=>{ if(pv) startPool(shuffle(pv.revisionIds).map(id=>ALL[id]).filter(Boolean),"revision"); };

  // Spaced review: schedule each answered question's next review. Additive —
  // it never affects scoring, only the review calendar shown on the dashboard.
  const recordReview=(id,correct)=>{
    if(typeof id!=="number") return;
    setReview(prev=>{ const np={ ...prev, [id]: nextReviewEntry(prev[id], correct) }; saveReview(np); return np; });
  };

  // Read-only skill map (grammar patterns), computed once for the bank.
  const grammarSkillMap = useMemo(()=>{ const m={}; for(const q of ALL){ if(q.type==="grammar") m[q.id]=classifyGrammarSkill(q); } return m; },[]);
  // The learning-journey dashboard model: skill mastery, weak areas, level
  // progress and the spaced-review schedule. Derived from existing progress
  // stats + the review calendar — nothing here changes scoring.
  const journey = useMemo(()=>{
    const seen=new Set([...stats.masteredIds, ...stats.strugglingIds]);
    const masteredSet=new Set(stats.masteredIds);
    const skills={};
    for(const q of ALL){ if(q.type!=="grammar") continue; const s=grammarSkillMap[q.id]; const e=skills[s.key]||(skills[s.key]={key:s.key,label:s.label,total:0,seen:0,mastered:0}); e.total++; if(seen.has(q.id)){ e.seen++; if(masteredSet.has(q.id)) e.mastered++; } }
    const list=Object.values(skills).filter(s=>s.total>0).map(s=>({...s, pct: s.seen?Math.round(s.mastered/s.seen*100):0}));
    const named=list.filter(s=>s.key!=="other");
    const weak=named.filter(s=>s.seen>=2 && s.mastered/s.seen<0.6).sort((a,b)=>(a.mastered/a.seen)-(b.mastered/b.seen) || b.seen-a.seen).slice(0,4);
    const masteredSkills=named.filter(s=>s.seen>=2 && s.mastered/s.seen>=0.8).length;
    const skillsWithData=named.filter(s=>s.seen>0).length;
    const levels=["A1","A2","B1","B2","C1","C2"].map(L=>{ let total=0,sn=0,ma=0; for(const q of ALL){ if(q.level!==L) continue; total++; if(seen.has(q.id)){ sn++; if(masteredSet.has(q.id)) ma++; } } return { level:L, total, seen:sn, mastered:ma, pct: sn?Math.round(ma/sn*100):0 }; }).filter(l=>l.total>0);
    const t=todayKey(); let due=0, nextDue=null;
    for(const id in review){ const e=review[id]; if(!e||!e.due) continue; if(e.due<=t) due++; else if(!nextDue||e.due<nextDue) nextDue=e.due; }
    return { seenCount:seen.size, total:ALL.length, mastered:masteredSet.size, struggling:stats.strugglingIds.length,
      accuracy: stats.lifetimeAnswered>0?Math.round(stats.lifetimeCorrect/stats.lifetimeAnswered*100):0,
      skillList: named.slice().sort((a,b)=>b.seen-a.seen), weak, masteredSkills, skillsWithData,
      levels, dueToday:due, nextDue, nextDueIn: nextDue?daysUntilKey(nextDue):null };
  }, [stats, review, grammarSkillMap]);
  const dueIds = useMemo(()=>{ const t=todayKey(); return Object.keys(review).filter(id=>review[id]&&review[id].due&&review[id].due<=t).map(Number).filter(id=>Number.isInteger(id)&&ALL[id]); },[review]);
  const startReviewDue=()=>{ startPool(shuffle(dueIds).map(id=>ALL[id]).filter(Boolean),"reviewdue"); };

  // Record an answer against the plan: it counts as done (whether right or
  // wrong — a mistake never adds to the workload) and wrong answers join the
  // optional revision queue until answered correctly. No-op without a plan.
  const recordPlanAnswer=(id,correct)=>{
    if(typeof id!=="number") return;
    setPlan(prev=>{
      if(!prev) return prev;
      const completedSet=new Set(prev.completed);
      let completed=prev.completed;
      if(!completedSet.has(id)) completed=[...prev.completed, id];
      let revision=prev.revision||[];
      const inRev=revision.includes(id);
      if(correct){ if(inRev) revision=revision.filter(x=>x!==id); }
      else { if(!inRev) revision=[...revision, id]; }
      if(completed===prev.completed && revision===(prev.revision||[])) return prev;
      const np={ ...prev, completed, revision };
      savePlan(np); return np;
    });
  };
  const findById=(id)=>{ const fromAll=(typeof id==="number")?ALL[id]:undefined; return fromAll!==undefined?fromAll:aiBank.find(a=>a.id===id); };
  const resumeSession=()=>{ if(lastKey) resumeKey(lastKey); };
  // Resume an existing saved session by key, clamping the position into range.
  const resumeKey=(key)=>{
    const sess=key&&sessionMap[key];
    if(!sess||!Array.isArray(sess.order)) return;
    const qs=sess.order.map(findById).filter(Boolean);
    if(qs.length===0){ const m={...sessionMap}; delete m[key]; writeSessions(m, lastKey===key?(Object.keys(m)[0]||null):lastKey); setPhase("home"); return; }
    const cur=Math.max(0,Math.min(sess.current||0, qs.length-1));
    setSessKey(key); setMode(sess.mode||"all"); setQuestions(qs); setCurrent(cur); setScore(Math.min(sess.score||0, qs.length)); setWrong(Array.isArray(sess.wrong)?sess.wrong:[]); setSelected(null); resetDeepExpl(); setAiQuestion(null); setPhase("quiz");
    if(lastKey!==key) writeSessions(sessionMap, key); // resumed session becomes the most recent
  };
  const startAIBank=()=>{ if(aiBank.length===0) return; if(sessionMap["aibank"]){ resumeKey("aibank"); return; } const pool=shuffle(aiBank); const sess={order:pool.map(x=>x.id),current:0,score:0,wrong:[],mode:"aibank",cat:"all",lvl:"all"}; setMode("aibank"); setSessKey("aibank"); setQuestions(pool); setCurrent(0); setSelected(null); setScore(0); setWrong([]); resetDeepExpl(); setAiQuestion(null); setPhase("quiz"); writeSessions({...sessionMap,aibank:sess}, "aibank"); };
  // Clicking a practice category RESUMES its own session if one is in progress,
  // otherwise starts it fresh. Pass {fresh:true} to force a restart.
  const start=(m,cat="all",lvl="all",opts)=>{
    const key=sessionKeyOf({mode:m,cat,lvl});
    if((!opts||!opts.fresh) && key && sessionMap[key]){ resumeKey(key); return; }
    let pool;
    if(m==="rapid"){
      const readingPool=shuffle(ALL.filter(x=>x.type==="reading")).slice(0,15);
      const grammarPool=shuffle(ALL.filter(x=>x.type==="grammar")).slice(0,5);
      pool=shuffle([...readingPool,...grammarPool]);
    } else if(m==="level"){
      pool=shuffle(ALL.filter(x=>x.level===lvl));
    } else {
      const base=cat==="all"?ALL:ALL.filter(x=>x.type===cat);
      pool=m==="random20"?shuffle(base).slice(0,20):shuffle(base);
    }
    const sess={order:pool.map(q=>q.id),current:0,score:0,wrong:[],mode:m,cat,lvl};
    setMode(m); setSessKey(key); setQuestions(pool); setCurrent(0); setSelected(null); setScore(0); setWrong([]); resetDeepExpl(); setAiQuestion(null); setPhase("quiz");
    writeSessions(key?{...sessionMap,[key]:sess}:sessionMap, key||lastKey);
  };

  const q=aiQuestion||questions[current];
  const total=questions.length;
  const progress=total>0?(current/total)*100:0;
  const isWrong=selected!==null&&q&&selected!==q.correct;

  function handleSelect(i){
    if(selected!==null) return;
    setSelected(i); resetDeepExpl();
    if(aiQuestion) return;
    const correct=i===q.correct;
    recordPlanAnswer(q.id,correct);
    recordReview(q.id,correct);
    const newScore=correct?score+1:score;
    const newWrong=correct?wrong:[...wrong,{...q,chosen:i}];
    if(correct) setScore(newScore); else setWrong(newWrong);
    const mastered=new Set(stats.masteredIds),struggling=new Set(stats.strugglingIds);
    if(correct){ mastered.add(q.id); struggling.delete(q.id);} else { struggling.add(q.id); mastered.delete(q.id);} 
    const ns={...stats,lifetimeCorrect:stats.lifetimeCorrect+(correct?1:0),lifetimeAnswered:stats.lifetimeAnswered+1,masteredIds:[...mastered],strugglingIds:[...struggling]};
    setStats(ns);
    // Review sessions save stats only; the active category session is updated
    // under its own key so switching categories never overwrites another's.
    if(isReviewMode(mode)||!sessKey){ saveProgress({stats:ns, sessionMap, lastKey}); }
    else { const sess={...(sessionMap[sessKey]||{mode,cat:"all",lvl:"all"}), order:questions.map(x=>x.id), current, score:newScore, wrong:newWrong}; writeSessions({...sessionMap,[sessKey]:sess}, sessKey, ns); }
  }
  function next(){
    setAiQuestion(null); resetDeepExpl();
    const review=isReviewMode(mode);
    if(current+1>=total){
      const pct=Math.round((score/total)*100); const fs={...stats,sessions:stats.sessions+1,bestPct:Math.max(stats.bestPct,pct)}; setStats(fs);
      if(review||!sessKey){ saveProgress({stats:fs, sessionMap, lastKey}); }
      else { const m={...sessionMap}; delete m[sessKey]; const nl=lastKey===sessKey?(Object.keys(m)[0]||null):lastKey; writeSessions(m, nl, fs); setSessKey(null); }
      setPhase("result");
    }
    else {
      const nc=current+1; setCurrent(nc); setSelected(null);
      if(review||!sessKey){ saveProgress({stats, sessionMap, lastKey}); }
      else { const sess={...(sessionMap[sessKey]||{mode,cat:"all",lvl:"all"}), order:questions.map(x=>x.id), current:nc, score, wrong}; writeSessions({...sessionMap,[sessKey]:sess}, sessKey); }
    }
  }
  async function generateAIQuestion(){
    if(genLock.current) return; // already generating — ignore the extra click
    genLock.current=true;
    setAiLoading(true); setSelected(null); resetDeepExpl(); setAiError(""); setAiQuestion(null);
    try{
      const topic=pickGrammarTopic();
      const context=AI_CONTEXTS[Math.floor(Math.random()*AI_CONTEXTS.length)];
      const system=buildGrammarPrompt(topic,context);
      // The model occasionally returns a malformed or duplicate item. Give it a
      // few tries, validating each candidate deterministically. Bad output is
      // rejected and retried, never patched (a patch could change the answer).
      let obj=null, lastErr="";
      for(let attempt=0;attempt<3;attempt++){
        const txt=await askClaude(system,[{role:"user",content:"Nouvelle question B2 sur : "+topic+"."}],800);
        let cand;
        try{ cand=JSON.parse(stripJsonFences(txt)); }
        catch(e){ lastErr="Format JSON invalide."; continue; }
        const err=validateAiQuestion(cand);
        if(err){ lastErr=err; continue; }
        if(isDuplicateAi(cand,loadAiBank())){ lastErr="Question déjà générée."; continue; }
        obj=cand; break;
      }
      if(!obj) throw new Error(lastErr||"Question invalide.");
      obj.id="ai-"+Date.now()+"-"+Math.random().toString(36).slice(2,8);
      obj.type="grammar"; obj.aiGenerated=true; obj.topic=topic;
      if(!obj.level) obj.level="B2";
      setAiQuestion(obj); setSelected(null);
      setAiBank(prev=>{ const next=[obj,...prev].slice(0,AI_BANK_MAX); saveAiBank(next); return next; });
    }catch(e){ setAiError(e.message==="NO_WORKER"?"Configure d'abord ton serveur IA (Réglages).":"Erreur IA : "+e.message); }
    genLock.current=false;
    setAiLoading(false);
  }
  async function explainDeeper(){
    setDeepLoading(true);
    resetDeepExpl();
    try{
      if(q.type==="reading"){
        const ctx=`Texte : "${q.passage}"\nQuestion : "${q.question}"\nBonne réponse : "${q.options[q.correct]}"\nMa réponse (incorrecte) : "${q.options[selected]}".\nAnalyse cette réponse selon les règles ci-dessus.`;
        // The structured JSON occasionally comes back malformed or truncated.
        // Give it a couple of tries, then fall back to a plain explanation so
        // the user always gets help instead of an error.
        let parsed=null;
        for(let attempt=0; attempt<3 && !parsed; attempt++){
          let txt;
          try{ txt=await askClaude(EXPLAIN_PLUS_SYSTEM,[{role:"user",content:ctx}],1300); }
          catch(e){ if(attempt===2) throw e; continue; }
          parsed=sanitizeExplainPlus(txt);
        }
        if(parsed) setDeepExplStructured(parsed);
        else {
          const fctx=`Texte : "${q.passage}"\nQuestion : "${q.question}"\nBonne réponse : "${q.options[q.correct]}"\nMa réponse (incorrecte) : "${q.options[selected]}".\nEn t'appuyant sur le texte, explique pourquoi la bonne réponse est correcte et pourquoi la mienne est fausse.`;
          const txt=await askClaude("Tu es un professeur de compréhension écrite (TCF B2) bienveillant. Explique clairement en 4-6 phrases, en citant le texte entre « guillemets ». Mets les termes clés en **gras**. Pas de titres markdown (pas de #).",[{role:"user",content:fctx}],650);
          setDeepExpl(txt);
        }
      } else {
        const ctx=`Phrase: "${q.sentence}"\nBonne réponse: "${q.options[q.correct]}"\nJ\u2019ai répondu: "${q.options[selected]}".\nExplique la règle, pourquoi c\u2019est faux, et donne un autre exemple.`;
        const txt=await askClaude("Tu es un professeur de français bienveillant (TCF B2). Explique clairement, en 4-6 phrases. Mets les termes clés en **gras**. Pas de titres markdown (pas de #), pas de listes numérotées inutiles — un paragraphe court suffit.",[{role:"user",content:ctx}],500);
        setDeepExpl(txt);
      }
    }catch(e){ setDeepExpl(e.message==="NO_WORKER"?"Configure d'abord ton serveur IA (Réglages).":"Erreur : "+e.message); }
    setDeepLoading(false);
  }
  function renderSentence(s){
    const p=s.split("___");
    if(p.length===1) return <span>{s}</span>;
    return (<span>{p[0]}<span style={{display:"inline-block",borderBottom:"2px solid "+BLUE,minWidth:54,margin:"0 5px",color:selected!==null?BLUE:"transparent",fontWeight:600}}>{selected!==null?q.options[q.correct]:"\u00A0\u00A0\u00A0\u00A0\u00A0"}</span>{p[1]}</span>);
  }

  // Keyboard play: 1-4/A-D pick an option before it's answered, Enter/Space
  // advances once it is \u2014 lets the whole quiz be driven without a mouse.
  useEffect(()=>{
    if(phase!=="quiz"||!q||showTutor||showSettings) return;
    function onKeyDown(e){
      if(e.target&&["INPUT","TEXTAREA"].includes(e.target.tagName)) return;
      if(selected===null){
        const idx="1234ABCDabcd".indexOf(e.key)%4;
        if(idx>=0&&idx<q.options.length&&"1234ABCDabcd".includes(e.key)) handleSelect(idx);
      } else if((e.key==="Enter"||e.key===" ")&&!["BUTTON","A","SUMMARY"].includes(e.target&&e.target.tagName)){
        // Buttons/links/<summary> already activate on Enter/Space on their
        // own — advancing the quiz here too would double-fire (e.g. tabbing
        // to "Explique-moi plus" or a collapsible section and pressing
        // Enter would open it AND immediately skip the question).
        e.preventDefault();
        if(aiQuestion) { setAiQuestion(null); setSelected(null); setPhase("home"); }
        else next();
      }
    }
    window.addEventListener("keydown",onKeyDown);
    return ()=>window.removeEventListener("keydown",onKeyDown);
  },[phase,q,selected,showTutor,showSettings,aiQuestion]);

  // ===== Tutor Chat =====
  // Starter prompts, grouped — shown on the empty state so the tutor's
  // capabilities are discoverable instead of facing a blank box.
  const TUTOR_STARTERS = [
    { cat:"Grammaire", icon:TypeIcon, items:[
      "Explique-moi le subjonctif simplement, avec 3 exemples.",
      "Quelle est la différence entre « dont » et « que » ?",
      "Imparfait ou passé composé : comment choisir ?",
    ]},
    { cat:"Vocabulaire", icon:BookIcon, items:[
      "Différence entre « apporter », « amener » et « emmener » ?",
      "Donne-moi 10 connecteurs logiques utiles au niveau B2.",
      "Explique l'expression « faire fi de » avec des exemples.",
    ]},
    { cat:"Entraînement", icon:TargetIcon, items:[
      "Pose-moi 3 questions de niveau B2 sur les pronoms relatifs.",
      "Corrige cette phrase : « Bien que je suis fatigué, je continue. »",
      "Fais-moi réviser mes points faibles.",
    ]},
    { cat:"Stratégie TCF", icon:SparkleIcon, items:[
      "Comment gérer mon temps pendant l'épreuve de compréhension écrite ?",
      "Quels sont les pièges les plus fréquents au TCF B2 ?",
      "Que dois-je réviser en priorité pour viser B2 ?",
    ]},
  ];

  function TutorChat({ onClose }){
    const [msgs,setMsgs]=useState([]);
    const [input,setInput]=useState(""); const [busy,setBusy]=useState(false);
    const sc=useRef(null); const ta=useRef(null);
    useEffect(()=>{ if(sc.current) sc.current.scrollTop=sc.current.scrollHeight; },[msgs,busy]);
    useEffect(()=>{ const el=ta.current; if(el){ el.style.height="auto"; el.style.height=Math.min(el.scrollHeight,120)+"px"; } },[input]);

    // Give the tutor real context about this learner so answers aren't generic.
    function buildSystem(){
      const weak=ALL.filter(x=>stats.strugglingIds.includes(x.id));
      const byLevel=weak.reduce((m,x)=>(m[x.level]=(m[x.level]||0)+1,m),{});
      const weakTopics=weak.slice(0,6).map(x=>x.type==="reading"?"compréhension écrite":(x.rule||"").slice(0,60)).filter(Boolean);
      const acc=stats.lifetimeAnswered>0?Math.round((stats.lifetimeCorrect/stats.lifetimeAnswered)*100):null;
      return [
        "Tu es un tuteur de français expert, spécialiste du TCF niveau B2. Tu es patient, chaleureux et direct.",
        "RÈGLES DE RÉPONSE :",
        "- Réponds dans la langue de l'élève (français par défaut, anglais s'il écrit en anglais).",
        "- Sois CONCIS : 150 mots maximum sauf si on te demande d'approfondir.",
        "- Donne TOUJOURS au moins un exemple concret en français, entre guillemets « … ».",
        "- Mets les termes clés importants en **gras**.",
        "- Utilise des listes à puces quand tu compares plusieurs éléments.",
        "- Termine par UNE question courte ou un mini-exercice pour faire pratiquer l'élève.",
        "- N'invente jamais une règle : si tu hésites, dis-le.",
        "- Pas de markdown autre que **gras** et les listes à puces (pas de titres #).",
        "CONTEXTE SUR L'ÉLÈVE :",
        acc!==null?`- Taux de réussite actuel : ${acc}% sur ${stats.lifetimeAnswered} questions.`:"- Il commence tout juste à s'entraîner.",
        weak.length?`- Il a ${weak.length} question(s) en difficulté, réparties par niveau : ${Object.entries(byLevel).map(([k,v])=>k+":"+v).join(", ")}.`:"",
        weakTopics.length?`- Exemples de points ratés : ${weakTopics.join(" | ")}`:"",
        "Utilise ce contexte pour cibler tes conseils, sans le réciter à l'élève.",
      ].filter(Boolean).join("\n");
    }

    async function send(text){
      const content=(text!==undefined?text:input).trim();
      if(!content||busy) return;
      const nm=[...msgs,{role:"user",content}]; setMsgs(nm); setInput(""); setBusy(true);
      try{
        const txt=await askClaude(buildSystem(),nm.map(m=>({role:m.role,content:m.content})),800);
        setMsgs(m=>[...m,{role:"assistant",content:txt}]);
      }catch(e){
        setMsgs(m=>[...m,{role:"assistant",content:e.message==="NO_WORKER"?"Configure d'abord ton serveur IA dans **Réglages** pour activer le tuteur.":"Erreur : "+e.message}]);
      }
      setBusy(false);
    }

    const empty=msgs.length===0;
    return (
      <div role="dialog" aria-modal="true" aria-label="Tuteur IA" className="modal-in" style={{position:"fixed",inset:0,background:BG,zIndex:50,display:"flex",flexDirection:"column",paddingTop:"env(safe-area-inset-top)"}}>
        <header style={{padding:"15px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid "+LINE,background:OVERLAY,backdropFilter:"blur(20px)",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:11}}>
            <div style={{width:34,height:34,borderRadius:11,background:GRADIENT_BRAND,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <SparkleIcon size={17} style={{color:"#fff"}}/>
            </div>
            <div style={{lineHeight:1.25}}>
              <div style={{fontWeight:600,fontSize:16,letterSpacing:"-0.02em"}}>Tuteur</div>
              <div style={{fontSize:12,color:busy?BLUE:GREY}}>{busy?"écrit…":"Spécialiste TCF B2"}</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            {!empty&&<button className="text-btn" onClick={()=>setMsgs([])} aria-label="Nouvelle conversation" style={{background:"none",border:"none",color:GREY,padding:0,display:"flex"}}><RefreshIcon size={18}/></button>}
            <button className="text-btn" onClick={onClose} style={{background:"none",border:"none",color:BLUE,fontSize:16}}>Fermer</button>
          </div>
        </header>

        <main ref={el=>{sc.current=el; mainRef.current=el;}} tabIndex={-1} className="tutor-scroll" style={{outline:"none",flex:1,overflowY:"auto",padding:"22px 18px",display:"flex",flexDirection:"column",gap:16}}>
          {empty ? (
            <div className="fade" style={{paddingTop:8}}>
              <div style={{textAlign:"center",marginBottom:28}}>
                <div style={{width:56,height:56,borderRadius:18,background:GRADIENT_BRAND,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",boxShadow:SHADOW_BLUE_LG}}>
                  <SparkleIcon size={26} style={{color:"#fff"}}/>
                </div>
                <h2 style={{fontSize:25,fontWeight:600,letterSpacing:"-0.03em",margin:"0 0 8px"}}>Comment puis-je t'aider ?</h2>
                <p style={{fontSize:15,color:GREY,margin:0,lineHeight:1.5,maxWidth:330,marginLeft:"auto",marginRight:"auto"}}>Pose une question, demande une règle, ou fais-toi interroger. Voici quelques idées :</p>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:22,maxWidth:520,margin:"0 auto",width:"100%"}}>
                {TUTOR_STARTERS.map(g=>(
                  <div key={g.cat}>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:10}}>
                      <g.icon size={14} style={{color:BLUE}}/>
                      <span style={{fontSize:12,fontWeight:600,color:GREY,textTransform:"uppercase",letterSpacing:"0.05em"}}>{g.cat}</span>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {g.items.map(s=>(
                        <button key={s} className="chip" onClick={()=>send(s)}>{s}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : msgs.map((m,i)=>(
            <div key={i} className="msg-in" style={{display:"flex",gap:10,alignItems:"flex-end",flexDirection:m.role==="user"?"row-reverse":"row"}}>
              {m.role==="assistant"&&(
                <div style={{width:26,height:26,borderRadius:9,background:GRADIENT_BRAND,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginBottom:2}}>
                  <SparkleIcon size={13} style={{color:"#fff"}}/>
                </div>
              )}
              <div style={{maxWidth:"84%",background:m.role==="user"?BLUE:CARD,color:m.role==="user"?"#fff":INK,borderRadius:20,borderBottomRightRadius:m.role==="user"?6:20,borderBottomLeftRadius:m.role==="user"?20:6,padding:"13px 17px",fontSize:15.5,lineHeight:1.58,boxShadow:m.role==="user"?SHADOW_BUBBLE_USER:SHADOW_BUBBLE_AI}}>
                {m.role==="user"?<span style={{whiteSpace:"pre-wrap"}}>{m.content}</span>:<RichText text={m.content}/>}
              </div>
            </div>
          ))}
          {busy&&(
            <div className="msg-in" role="status" aria-label="Le tuteur écrit une réponse" style={{display:"flex",gap:10,alignItems:"flex-end"}}>
              <div style={{width:26,height:26,borderRadius:9,background:GRADIENT_BRAND,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginBottom:2}}>
                <SparkleIcon size={13} style={{color:"#fff"}}/>
              </div>
              <div style={{background:CARD,borderRadius:20,borderBottomLeftRadius:6,padding:"14px 17px",boxShadow:SHADOW_BUBBLE_AI}}>
                <div className="typing"><i/><i/><i/></div>
              </div>
            </div>
          )}
        </main>

        <footer style={{padding:"12px 14px",paddingBottom:"max(12px,env(safe-area-inset-bottom))",background:OVERLAY_SOLID,backdropFilter:"blur(20px)",borderTop:"1px solid "+LINE,flexShrink:0}}>
          <div style={{display:"flex",gap:10,alignItems:"flex-end",maxWidth:640,margin:"0 auto"}}>
            <textarea ref={ta} value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
              placeholder="Pose ta question…" rows={1} aria-label="Ton message au tuteur"
              style={{flex:1,borderRadius:20,border:"1px solid "+LINE,padding:"12px 17px",fontSize:16,resize:"none",outline:"none",maxHeight:120,background:BG,color:INK,lineHeight:1.4}}/>
            <button className="pill-btn" onClick={()=>send()} disabled={busy||!input.trim()} aria-label="Envoyer"
              style={{borderRadius:"50%",width:42,height:42,border:"none",background:busy||!input.trim()?GREY_SOFT:BLUE,color:"#fff",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:1}}>
              <ChevronRight size={18} stroke={2.5} style={{transform:"rotate(-90deg)"}}/>
            </button>
          </div>
        </footer>
      </div>
    );
  }

  // ===== Settings =====
  if(showSettings){
    const themeOptions=[
      { id:"system", label:"Système", Icon:GearIcon },
      { id:"light", label:"Clair", Icon:SunIcon },
      { id:"dark", label:"Sombre", Icon:MoonIcon },
    ];
    return (
      <div style={{minHeight:"100vh",background:BG,padding:"max(24px,env(safe-area-inset-top)) 22px 40px"}}>
        <main ref={mainRef} tabIndex={-1} style={{outline:"none",maxWidth:600,margin:"0 auto"}} className="fade">
          <button className="text-btn" onClick={()=>setShowSettings(false)} style={{background:"none",border:"none",color:BLUE,fontSize:16,marginBottom:24,padding:0,display:"flex",alignItems:"center",gap:2}}><ChevronLeft size={18}/>Retour</button>
          <h1 style={{fontSize:32,fontWeight:600,letterSpacing:"-0.03em",margin:"0 0 30px"}}>Réglages</h1>

          <SectionLabel icon={SunIcon}>Apparence</SectionLabel>
          <div style={{background:CARD,border:"1px solid "+LINE,borderRadius:RADIUS,padding:8,display:"flex",gap:6,marginBottom:28}}>
            {themeOptions.map(o=>{
              const active=themeMode===o.id;
              return (
                <button key={o.id} onClick={()=>setThemeMode(o.id)} aria-pressed={active}
                  style={{flex:1,border:"none",borderRadius:12,padding:"12px 8px",background:active?BLUE:"transparent",color:active?"#fff":INK,display:"flex",flexDirection:"column",alignItems:"center",gap:6,fontSize:13,fontWeight:500,transition:"background-color .15s ease"}}>
                  <o.Icon size={18}/>{o.label}
                </button>
              );
            })}
          </div>

          <SectionLabel icon={TargetIcon}>Apprentissage</SectionLabel>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:28}}>
            {plan&&<div style={{background:CARD,border:"1px solid "+LINE,borderRadius:RADIUS,padding:20,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
              <div>
                <div style={{fontSize:15,fontWeight:600,color:INK}}>Plan d'étude</div>
                <div style={{fontSize:13,color:GREY,marginTop:2}}>{pv?pv.completedCount:0} / {ALL.length} questions faites</div>
              </div>
              <button className="text-btn" onClick={()=>{ if(confirm("Abandonner le plan en cours ? Ta progression sera perdue.")){ abandonPlan(); } }} style={{background:"none",border:"none",color:RED,fontSize:14,whiteSpace:"nowrap"}}>Abandonner</button>
            </div>}
            {aiBank.length>0&&<div style={{background:CARD,border:"1px solid "+LINE,borderRadius:RADIUS,padding:20,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
              <div>
                <div style={{fontSize:15,fontWeight:600,color:INK}}>Mes questions IA</div>
                <div style={{fontSize:13,color:GREY,marginTop:2}}>{aiBank.length} question{aiBank.length>1?"s":""} enregistrée{aiBank.length>1?"s":""} sur cet appareil</div>
              </div>
              <button className="text-btn" onClick={()=>{ if(confirm("Supprimer toutes tes questions générées par IA ?")){ setAiBank([]); saveAiBank([]); } }} style={{background:"none",border:"none",color:RED,fontSize:14,whiteSpace:"nowrap"}}>Vider</button>
            </div>}
            {(stats.lifetimeAnswered>0||hasSession)&&<div style={{background:CARD,border:"1px solid "+LINE,borderRadius:RADIUS,padding:20,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
              <div>
                <div style={{fontSize:15,fontWeight:600,color:INK}}>Progression</div>
                <div style={{fontSize:13,color:GREY,marginTop:2}}>{stats.lifetimeAnswered} question{stats.lifetimeAnswered>1?"s":""} répondue{stats.lifetimeAnswered>1?"s":""} au total</div>
              </div>
              <button className="text-btn" onClick={()=>{ if(confirm("Réinitialiser toute ta progression ?")){ setStats(emptyStats); writeSessions({}, null, emptyStats); } }} style={{background:"none",border:"none",color:RED,fontSize:14,whiteSpace:"nowrap"}}>Réinitialiser</button>
            </div>}
            {!plan&&aiBank.length===0&&stats.lifetimeAnswered===0&&!hasSession&&<div style={{fontSize:14,color:GREY,padding:"4px 2px"}}>Rien à afficher pour l'instant — commence à réviser pour voir ta progression ici.</div>}
          </div>

          <SectionLabel icon={CheckIcon}>Accessibilité</SectionLabel>
          <div style={{background:CARD,border:"1px solid "+LINE,borderRadius:RADIUS,padding:20,marginBottom:28,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
            <div>
              <div style={{fontSize:15,fontWeight:600,color:INK}}>Réduire les animations</div>
              <div style={{fontSize:13,color:GREY,marginTop:2,lineHeight:1.45}}>Désactive les transitions et animations dans toute l'app, en plus du réglage de ton appareil.</div>
            </div>
            <button role="switch" aria-checked={reduceMotion} aria-label="Réduire les animations" onClick={()=>setReduceMotion(v=>!v)}
              style={{flexShrink:0,width:46,height:28,borderRadius:14,border:"none",background:reduceMotion?BLUE:TRACK_BG,position:"relative",transition:"background-color .15s ease"}}>
              <span style={{position:"absolute",top:3,left:reduceMotion?21:3,width:22,height:22,borderRadius:"50%",background:"#fff",boxShadow:SHADOW_XS,transition:"left .15s ease"}}/>
            </button>
          </div>

          <SectionLabel icon={SparkleIcon}>Tuteur</SectionLabel>
          <div style={{background:CARD,border:"1px solid "+LINE,borderRadius:RADIUS,padding:24,boxShadow:SHADOW_CARD,display:"flex",alignItems:"center",gap:14,marginBottom:12}}>
            <div style={{width:40,height:40,borderRadius:12,background:GRADIENT_BRAND,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <SparkleIcon size={20} style={{color:"#fff"}}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:16,fontWeight:600,color:INK,display:"flex",alignItems:"center",gap:7}}>
                Intelligence
                <span style={{fontSize:11,fontWeight:700,color:GREEN_TEXT,background:GREEN_BG,padding:"3px 8px",borderRadius:6,letterSpacing:"0.03em"}}>ACTIVE</span>
              </div>
              <div style={{fontSize:13,color:GREY,marginTop:3}}>{isCustomWorker()?"Serveur personnalisé":"Serveur intégré à l'app"}</div>
            </div>
          </div>

          <details style={{marginBottom:28}}>
            <summary style={{fontSize:14,color:GREY,cursor:"pointer",padding:"10px 4px",listStyle:"none",display:"flex",alignItems:"center",gap:6}}>
              <GearIcon size={15}/>Avancé — utiliser mon propre serveur
            </summary>
            <div style={{background:CARD,border:"1px solid "+LINE,borderRadius:RADIUS,padding:24,boxShadow:SHADOW_CARD,marginTop:8}}>
              <label style={{fontSize:13,fontWeight:600,color:GREY,textTransform:"uppercase",letterSpacing:"0.04em"}}>Adresse du serveur</label>
              <input value={workerUrlInput} onChange={e=>setWorkerUrlInput(e.target.value)} placeholder={DEFAULT_WORKER} style={{width:"100%",borderRadius:12,border:"1px solid "+LINE,padding:"14px 16px",fontSize:16,outline:"none",boxSizing:"border-box",marginTop:10,background:BG,color:INK}}/>
              <p style={{fontSize:13,color:GREY,lineHeight:1.6,marginTop:12,marginBottom:0}}>Laisse vide pour utiliser le serveur intégré. Pour héberger le tien : déploie <code style={{background:CODE_BG,padding:"2px 6px",borderRadius:6}}>worker.js</code> sur <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noopener" style={{color:BLUE}}>Cloudflare Workers</a> avec ta clé <code style={{background:CODE_BG,padding:"2px 6px",borderRadius:6}}>ANTHROPIC_API_KEY</code>.</p>
              <div style={{marginTop:16,display:"flex",gap:10}}>
                <PillButton onClick={()=>{ setWorkerUrl(workerUrlInput.trim()); alert(workerUrlInput.trim()?"Serveur personnalisé enregistré.":"Retour au serveur intégré."); setShowSettings(false); }} style={{flex:1}}>Enregistrer</PillButton>
                {isCustomWorker()&&<PillButton kind="grey" onClick={()=>{ setWorkerUrl(""); setWorkerUrlInput(""); alert("Retour au serveur intégré."); }}>Réinitialiser</PillButton>}
              </div>
            </div>
          </details>

          <SectionLabel icon={InfoIcon}>À propos</SectionLabel>
          <div style={{background:CARD,border:"1px solid "+LINE,borderRadius:RADIUS,padding:24}}>
            <Wordmark size={26}/>
            <p style={{fontSize:14,color:GREY,lineHeight:1.6,margin:"14px 0 0"}}>Entraînement TCF B2 : structure de la langue et compréhension écrite, avec tuteur IA. {ALL.length} questions, un plan de 14 jours, et des explications sur mesure — tout reste stocké sur cet appareil.</p>
          </div>
        </main>
      </div>
    );
  }
  if(showTutor) return <TutorChat onClose={()=>setShowTutor(false)} />;

  // ===== Home =====
  // ===== Study-plan screen (central navigation) =====
  // ===== Learning-journey dashboard =====
  if(phase==="parcours"){
    const j=journey;
    const Bar=({pct,color})=>(<div style={{height:8,background:TRACK_BG,borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.max(0,Math.min(100,pct))}%`,background:color||BLUE,borderRadius:4,transition:"width .5s"}}/></div>);
    const bigTile=(label,value,sub)=>(
      <div style={{flex:"1 1 0",minWidth:0,background:CARD,border:"1px solid "+LINE,borderRadius:16,padding:"16px 14px",textAlign:"center",boxShadow:SHADOW_XS}}>
        <div style={{fontSize:24,fontWeight:700,letterSpacing:"-0.03em",color:INK}}>{value}</div>
        <div style={{fontSize:12,color:GREY,marginTop:3}}>{label}</div>
        {sub&&<div style={{fontSize:11,color:GREY,marginTop:1}}>{sub}</div>}
      </div>
    );
    const skillColor=(pct)=> pct>=80?GREEN:pct>=50?BLUE:AMBER_TEXT;
    return (
      <div style={{minHeight:"100vh",background:BG}}>
        <header style={{position:"sticky",top:0,zIndex:10,background:OVERLAY,backdropFilter:"blur(20px)",borderBottom:"1px solid "+LINE,padding:"calc(env(safe-area-inset-top) + 12px) 22px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <button className="text-btn" onClick={()=>setPhase("home")} style={{background:"none",border:"none",color:BLUE,fontSize:16,padding:0,display:"flex",alignItems:"center",gap:2}}><ChevronLeft size={19}/>Accueil</button>
          <span style={{fontSize:15,color:INK,fontWeight:600}}>Mon parcours</span>
          <div style={{width:64}}/>
        </header>
        <main ref={mainRef} tabIndex={-1} style={{outline:"none",maxWidth:600,margin:"0 auto",padding:"24px 22px 72px"}}>
          {j.seenCount===0 ? (
            <div className="fade" style={{textAlign:"center",padding:"32px 0"}}>
              <TargetIcon size={30} style={{color:BLUE,margin:"0 auto 14px"}}/>
              <h1 style={{fontSize:26,fontWeight:600,letterSpacing:"-0.03em",margin:"0 0 8px"}}>Ton parcours commence ici</h1>
              <p style={{fontSize:16,color:GREY,lineHeight:1.5,margin:"0 0 22px"}}>Réponds à quelques questions et cet écran te montrera tes compétences maîtrisées, tes points faibles et tes révisions à venir.</p>
              <PillButton onClick={()=>start("all","all")} style={{minWidth:200}}>Commencer</PillButton>
            </div>
          ) : (
            <div className="fade">
              {/* Journey summary */}
              <div style={{display:"flex",gap:10,marginBottom:8}}>
                {bigTile("Questions vues", j.seenCount, "/ "+j.total)}
                {bigTile("Réussite", j.accuracy+"%")}
                {bigTile("Maîtrisées", j.mastered)}
              </div>

              {/* Spaced review */}
              <SectionLabel icon={RefreshIcon}>Révision espacée</SectionLabel>
              <div style={{background:CARD,border:"1px solid "+(j.dueToday>0?BLUE:LINE),borderRadius:18,padding:"18px 20px",boxShadow:SHADOW_XS,marginBottom:26}}>
                {j.dueToday>0 ? (
                  <>
                    <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:14}}>
                      <span style={{fontSize:30,fontWeight:700,letterSpacing:"-0.03em",color:BLUE}}>{j.dueToday}</span>
                      <span style={{fontSize:15,color:INK}}>question{j.dueToday>1?"s":""} à réviser aujourd'hui</span>
                    </div>
                    <PillButton onClick={startReviewDue} style={{width:"100%"}}>Réviser maintenant</PillButton>
                  </>
                ) : j.nextDue ? (
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:40,height:40,borderRadius:11,background:GREEN_BG,color:GREEN_TEXT,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><CheckIcon size={20} stroke={2.5}/></div>
                    <div>
                      <div style={{fontSize:15,fontWeight:600,color:INK}}>À jour pour aujourd'hui</div>
                      <div style={{fontSize:13,color:GREY,marginTop:1}}>Prochaine révision {j.nextDueIn<=0?"aujourd'hui":j.nextDueIn===1?"demain":"dans "+j.nextDueIn+" jours"} · {formatDateFr(j.nextDue)}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{fontSize:14,color:GREY,lineHeight:1.5}}>Réponds à des questions et elles réapparaîtront ici, espacées dans le temps, pour ancrer ta mémoire.</div>
                )}
              </div>

              {/* Weak areas */}
              {j.weak.length>0&&(
                <>
                  <SectionLabel icon={TargetIcon}>À travailler</SectionLabel>
                  <div style={{background:CARD,border:"1px solid "+LINE,borderRadius:18,padding:"8px 18px",boxShadow:SHADOW_XS,marginBottom:26}}>
                    {j.weak.map((s,i,arr)=>(
                      <div key={s.key} style={{padding:"13px 0",borderBottom:i<arr.length-1?"1px solid "+LINE:"none"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:7}}>
                          <span style={{fontSize:14.5,fontWeight:600,color:INK}}>{s.label}</span>
                          <span style={{fontSize:13,color:AMBER_TEXT,fontWeight:600}}>{s.mastered}/{s.seen}</span>
                        </div>
                        <Bar pct={s.pct} color={AMBER_TEXT}/>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Grammar skills */}
              <SectionLabel icon={TypeIcon}>Compétences grammaticales</SectionLabel>
              <div style={{fontSize:13,color:GREY,margin:"-6px 0 12px"}}>{j.masteredSkills} compétence{j.masteredSkills>1?"s":""} maîtrisée{j.masteredSkills>1?"s":""} sur {j.skillsWithData} travaillée{j.skillsWithData>1?"s":""}</div>
              <div style={{background:CARD,border:"1px solid "+LINE,borderRadius:18,padding:"8px 18px",boxShadow:SHADOW_XS,marginBottom:26}}>
                {j.skillList.filter(s=>s.seen>0).length===0 ? (
                  <div style={{fontSize:14,color:GREY,padding:"10px 0",lineHeight:1.5}}>Fais quelques questions de « Structure de la langue » pour révéler tes compétences par thème.</div>
                ) : j.skillList.filter(s=>s.seen>0).map((s,i,arr)=>(
                  <div key={s.key} style={{padding:"13px 0",borderBottom:i<arr.length-1?"1px solid "+LINE:"none"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:7}}>
                      <span style={{fontSize:14.5,fontWeight:600,color:INK}}>{s.label}</span>
                      <span style={{fontSize:13,color:GREY}}>{s.mastered}/{s.seen} · {s.pct}%</span>
                    </div>
                    <Bar pct={s.pct} color={skillColor(s.pct)}/>
                  </div>
                ))}
              </div>

              {/* By level */}
              <SectionLabel icon={BookIcon}>Par niveau</SectionLabel>
              <div style={{background:CARD,border:"1px solid "+LINE,borderRadius:18,padding:"8px 18px",boxShadow:SHADOW_XS}}>
                {j.levels.map((l,i,arr)=>(
                  <div key={l.level} style={{padding:"13px 0",borderBottom:i<arr.length-1?"1px solid "+LINE:"none"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                      <span style={{fontSize:12,fontWeight:700,letterSpacing:"0.03em",color:LEVEL_COLORS[l.level],background:LEVEL_BG[l.level],padding:"3px 9px",borderRadius:7}}>{l.level}</span>
                      <span style={{fontSize:13,color:GREY}}>{l.mastered} maîtrisées · {l.seen}/{l.total} vues</span>
                    </div>
                    <Bar pct={l.total?Math.round(l.mastered/l.total*100):0} color={LEVEL_COLORS[l.level]}/>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  if(phase==="plan"){
    const chipStyle=(active)=>({padding:"10px 0",flex:"1 1 0",minWidth:54,textAlign:"center",borderRadius:12,border:"1px solid "+(active?BLUE:LINE),background:active?BLUE:CARD,color:active?"#fff":INK,fontSize:15,fontWeight:600});
    const statTile=(label,value,accent)=>(
      <div style={{flex:"1 1 0",minWidth:0,textAlign:"center"}}>
        <div style={{fontSize:26,fontWeight:700,letterSpacing:"-0.03em",color:accent||INK}}>{value}</div>
        <div style={{fontSize:12,color:GREY,marginTop:2}}>{label}</div>
      </div>
    );
    const DurationPicker=(
      <div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {PLAN_DURATIONS.map(d=>(
            <button key={d} className="opt-row" onClick={()=>{ setCustomDaysOpen(false); plan?changePlanDuration(d):startPlan(d); }} style={chipStyle(plan&&pv?(!customDaysOpen&&pv.duration===d):false)}>{d} j</button>
          ))}
          <button className="opt-row" onClick={()=>setCustomDaysOpen(o=>!o)} style={chipStyle(customDaysOpen)}>Perso</button>
        </div>
        {customDaysOpen&&(
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <input type="number" inputMode="numeric" min={PLAN_MIN_DAYS} max={PLAN_MAX_DAYS} value={customDays} onChange={e=>setCustomDays(e.target.value)} placeholder={"Jours ("+PLAN_MIN_DAYS+"–"+PLAN_MAX_DAYS+")"} aria-label="Nombre de jours" style={{flex:1,padding:"11px 14px",borderRadius:12,border:"1px solid "+LINE,background:CARD,color:INK,fontSize:15}}/>
            <PillButton onClick={()=>{ if(!String(customDays).trim()) return; const d=clampInt(parseInt(customDays,10)||0,PLAN_MIN_DAYS,PLAN_MAX_DAYS); plan?changePlanDuration(d):startPlan(d); setCustomDaysOpen(false); setCustomDays(""); }} style={{minWidth:104}}>Valider</PillButton>
          </div>
        )}
      </div>
    );
    const statusPill=!pv?null:(pv.paused?{t:"En pause",bg:TRACK_BG,c:GREY}:pv.finished?{t:"Terminé",bg:GREEN_BG,c:GREEN_TEXT}:pv.dayComplete?{t:"Jour fait",bg:GREEN_BG,c:GREEN_TEXT}:pv.overdueDays>0?{t:"Rattrapage",bg:AMBER_BG,c:AMBER_TEXT}:{t:"En cours",bg:QUOTE_BG,c:BLUE});
    return (
      <div style={{minHeight:"100vh",background:BG}}>
        <header style={{position:"sticky",top:0,zIndex:10,background:OVERLAY,backdropFilter:"blur(20px)",borderBottom:"1px solid "+LINE,padding:"calc(env(safe-area-inset-top) + 12px) 22px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <button className="text-btn" onClick={()=>setPhase("home")} style={{background:"none",border:"none",color:BLUE,fontSize:16,padding:0,display:"flex",alignItems:"center",gap:2}}><ChevronLeft size={19}/>Accueil</button>
          <span style={{fontSize:15,color:INK,fontWeight:600}}>Plan d'étude</span>
          <div style={{width:64}}/>
        </header>
        <main ref={mainRef} tabIndex={-1} style={{outline:"none",maxWidth:600,margin:"0 auto",padding:"24px 22px 72px"}}>
          {(!plan||!pv) ? (
            <div className="fade">
              <h1 style={{fontSize:30,fontWeight:600,letterSpacing:"-0.03em",margin:"8px 0 12px"}}>Ton plan d'étude</h1>
              <p style={{fontSize:16,color:GREY,lineHeight:1.5,margin:"0 0 22px"}}>En combien de jours veux-tu terminer les {ALL.length} questions ? On répartit tout automatiquement, jour par jour.</p>
              {DurationPicker}
              <p style={{fontSize:13,color:GREY,marginTop:14,lineHeight:1.5}}>Choisis une durée pour démarrer. Tu pourras la changer quand tu veux — ta progression est toujours conservée.</p>
            </div>
          ) : pv.finished ? (
            <div className="fade" style={{textAlign:"center",padding:"20px 0"}}>
              <CheckIcon size={34} stroke={2.5} style={{color:GREEN,margin:"0 auto 14px"}}/>
              <h1 style={{fontSize:28,fontWeight:600,letterSpacing:"-0.03em",margin:"0 0 8px"}}>Plan terminé</h1>
              <p style={{fontSize:16,color:GREY,lineHeight:1.5,margin:"0 0 24px"}}>Tu as répondu aux {pv.total} questions. Bravo.</p>
              {pv.revisionIds.length>0&&<PillButton onClick={startRevisionSession} style={{minWidth:240,marginBottom:12}}>Réviser mes {pv.revisionIds.length} erreur{pv.revisionIds.length>1?"s":""}</PillButton>}
              <div><button className="text-btn" onClick={()=>{ if(confirm("Recommencer le plan depuis zéro ? Ta progression sera remise à zéro.")){ startPlan(pv.duration); } }} style={{background:"none",border:"none",color:BLUE,fontSize:15,marginTop:4}}>Recommencer un plan</button></div>
            </div>
          ) : (
            <div className="fade">
              {/* Daily card */}
              <div style={{background:CARD,border:"1px solid "+LINE,borderRadius:22,padding:"22px 22px 24px",boxShadow:SHADOW_CARD}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                  <div><span style={{fontSize:24,fontWeight:700,letterSpacing:"-0.03em"}}>Jour {pv.dayNum}</span><span style={{fontSize:15,color:GREY,marginLeft:6}}>sur {pv.duration}</span></div>
                  {statusPill&&<span style={{fontSize:12,fontWeight:700,letterSpacing:"0.03em",color:statusPill.c,background:statusPill.bg,padding:"5px 10px",borderRadius:8}}>{statusPill.t}</span>}
                </div>
                <div style={{display:"flex",gap:8,marginBottom:18}}>
                  {statTile("Assignées",pv.assigned)}
                  {statTile("Faites",pv.doneToday,GREEN_TEXT)}
                  {statTile("Restantes",pv.remToday,pv.remToday>0?BLUE:GREY)}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:7}}>
                  <span style={{fontSize:13,color:GREY}}>Aujourd'hui</span>
                  <span style={{fontSize:13,color:GREY}}>{pv.completedCount} / {pv.total} · {pv.pct}%</span>
                </div>
                <div style={{height:8,background:TRACK_BG,borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${pv.assigned>0?Math.min(100,Math.round(pv.doneToday/pv.assigned*100)):100}%`,background:pv.dayComplete?GREEN:BLUE,borderRadius:4,transition:"width .5s"}}/></div>
                {pv.paused ? (
                  <PillButton onClick={resumePlan} style={{width:"100%",marginTop:20}}>Reprendre le plan</PillButton>
                ) : pv.remToday>0 ? (
                  <PillButton onClick={startPlanSession} style={{width:"100%",marginTop:20}}>Commencer la séance · {pv.remToday}</PillButton>
                ) : (
                  <>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:GREEN_BG,color:GREEN_TEXT,padding:"12px 16px",borderRadius:12,fontSize:14,fontWeight:600,marginTop:20}}>
                      <CheckIcon size={16} stroke={2.5}/>Objectif du jour atteint
                    </div>
                    {pv.remaining>0&&<PillButton kind="secondary" onClick={startContinueAhead} style={{width:"100%",marginTop:12}}>Continuer en avance · {pv.nextAssigned}</PillButton>}
                  </>
                )}
              </div>

              {/* Revision queue */}
              {pv.revisionIds.length>0&&(
                <div style={{background:CARD,border:"1px solid "+LINE,borderRadius:18,padding:"16px 18px",boxShadow:SHADOW_XS,marginTop:14,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                  <div>
                    <div style={{fontSize:15,fontWeight:600,color:INK}}>File de révision</div>
                    <div style={{fontSize:13,color:GREY,marginTop:2}}>{pv.revisionIds.length} erreur{pv.revisionIds.length>1?"s":""} à revoir — optionnel</div>
                  </div>
                  <button className="text-btn" onClick={startRevisionSession} style={{background:QUOTE_BG,border:"none",color:BLUE,fontSize:14,fontWeight:600,padding:"9px 16px",borderRadius:11,whiteSpace:"nowrap"}}>Réviser</button>
                </div>
              )}

              {/* Overview */}
              <SectionLabel icon={TargetIcon}>Vue d'ensemble</SectionLabel>
              <div style={{background:CARD,border:"1px solid "+LINE,borderRadius:18,padding:"6px 18px",boxShadow:SHADOW_XS,marginBottom:26}}>
                {[["Total",pv.total],["Terminées",pv.completedCount],["Restantes",pv.remaining],["Jour actuel",pv.dayNum+" / "+pv.duration],["Jours restants",pv.daysRemaining],["Moyenne / jour","~"+pv.avgPerDay],["Fin estimée",formatDateFr(pv.endKey)]].map((row,i,arr)=>(
                  <div key={row[0]} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:i<arr.length-1?"1px solid "+LINE:"none"}}>
                    <span style={{fontSize:14.5,color:GREY}}>{row[0]}</span>
                    <span style={{fontSize:14.5,fontWeight:600,color:INK}}>{row[1]}</span>
                  </div>
                ))}
              </div>

              {/* Day-by-day progress */}
              <SectionLabel icon={CheckIcon}>Progression</SectionLabel>
              <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:26}}>
                {pv.days.map(d=>{
                  const st=d.status;
                  const bg=st==="done"?GREEN_BG:st==="current"?BLUE:CARD;
                  const col=st==="done"?GREEN_TEXT:st==="current"?"#fff":GREY;
                  const bd=st==="current"?BLUE:LINE;
                  return (
                    <div key={d.dayNum} title={"Jour "+d.dayNum+" · ~"+d.quota+" questions"} style={{width:38,height:38,borderRadius:10,background:bg,border:"1px solid "+bd,color:col,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:600}}>
                      {st==="done"?<CheckIcon size={15} stroke={3}/>:d.dayNum}
                    </div>
                  );
                })}
              </div>

              {/* Plan settings */}
              <SectionLabel icon={GearIcon}>Réglages du plan</SectionLabel>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:13,color:GREY,marginBottom:8}}>Durée — seules les questions non répondues sont redistribuées.</div>
                {DurationPicker}
              </div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:14}}>
                <button className="text-btn" onClick={pv.paused?resumePlan:pausePlan} style={{flex:"1 1 40%",minWidth:130,background:CARD,border:"1px solid "+LINE,borderRadius:12,padding:"12px 14px",color:INK,fontSize:14,fontWeight:500}}>{pv.paused?"Reprendre":"Mettre en pause"}</button>
                <button className="text-btn" onClick={()=>{ if(confirm("Redémarrer le calendrier à aujourd'hui ? Ta progression est conservée.")) restartPlan(); }} style={{flex:"1 1 40%",minWidth:130,background:CARD,border:"1px solid "+LINE,borderRadius:12,padding:"12px 14px",color:INK,fontSize:14,fontWeight:500}}>Redémarrer</button>
                <button className="text-btn" onClick={()=>{ if(confirm("Abandonner le plan ? Ta progression sera perdue.")){ abandonPlan(); setPhase("home"); } }} style={{flex:"1 1 100%",background:"none",border:"none",color:RED,fontSize:14,fontWeight:500,padding:"6px"}}>Abandonner le plan</button>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  if(phase==="home"){
    const mastered=stats.masteredIds.length, struggling=stats.strugglingIds.length;
    // Per-category mistake pools for the "Réviser mes erreurs" cards. These run
    // as transient review sessions, so they never touch practice progress.
    const strugSet=new Set(stats.strugglingIds);
    const grammarMistakes=[...ALL,...aiBank].filter(x=>x.type==="grammar" && strugSet.has(x.id));
    const readingMistakes=ALL.filter(x=>x.type==="reading" && strugSet.has(x.id));
    const pct=stats.lifetimeAnswered>0?Math.round((stats.lifetimeCorrect/stats.lifetimeAnswered)*100):0;
    // Resumable (non-review) session, surfaced as an explicit card in Pratique
    // so continuing is a first-class option, not only the hero button.
    const savedSession = lastKey ? sessionMap[lastKey] : null;
    const MODE_LABELS = { all:"Entraînement complet", grammar:"Structure de la langue", reading:"Compréhension écrite", random20:"Série de 20", rapid:"Mode rapide", level:"Par niveau", plan:"Séance du plan", aibank:"Questions IA", reviewdue:"Révision du jour" };
    const resumable = (savedSession && Array.isArray(savedSession.order) && savedSession.order.length && savedSession.current < savedSession.order.length && !isReviewMode(savedSession.mode))
      ? { label: MODE_LABELS[savedSession.mode]||"Séance", current: savedSession.current, total: savedSession.order.length }
      : null;

    // One obvious primary action, chosen by what's most relevant right now:
    // an in-progress session beats today's plan slice beats a cold start.
    const planCta = plan&&pv&&!pv.finished&&pv.remToday>0
      ? { label: pv.overdueDays>0?`Rattraper ${pv.remToday} question${pv.remToday>1?"s":""}`:`Faire mes ${pv.remToday} question${pv.remToday>1?"s":""} du jour`, fn:startPlanSession }
      : null;
    const heroCta = hasSession
      ? { label:"Reprendre", fn:resumeSession }
      : (planCta || (plan&&pv&&!pv.finished ? { label:"Ouvrir le plan", fn:()=>setPhase("plan") } : { label:"Commencer", fn:()=>start("all","all") }));
    const planCtaShownInHero = heroCta.fn===startPlanSession;

    return (
      <div style={{minHeight:"100vh",background:BG}}>
        <header style={{position:"sticky",top:0,zIndex:10,background:OVERLAY,backdropFilter:"blur(20px)",borderBottom:"1px solid "+LINE,padding:"calc(env(safe-area-inset-top) + 12px) 22px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <Wordmark/>
          <button className="text-btn" onClick={()=>setShowSettings(true)} aria-label="Réglages" style={{background:"none",border:"none",color:GREY,padding:6,display:"flex"}}><GearIcon size={22}/></button>
        </header>

        <main ref={mainRef} tabIndex={-1} className="app-shell" style={{outline:"none",maxWidth:640,margin:"0 auto",padding:"0 22px 64px"}}>
          {/* Hero — the one clear next step */}
          <div className="fade hero-pad" style={{textAlign:"center",padding:"52px 0 40px"}}>
            <div style={{fontSize:14,color:BLUE,fontWeight:600,letterSpacing:"-0.01em",marginBottom:10}}>Entraînement TCF</div>
            <h1 className="hero-title" style={{fontSize:44,lineHeight:1.08,fontWeight:600,letterSpacing:"-0.035em",margin:"0 0 14px"}}>Maîtrise ton<br/>français.</h1>
            <p style={{fontSize:18,color:GREY,letterSpacing:"-0.01em",margin:"0 0 28px",lineHeight:1.4}}>{ALL.length} questions niveau B2.{hasWorker?" Avec tuteur IA.":""}</p>
            <PillButton onClick={heroCta.fn} style={{minWidth:220}}>{heroCta.label}</PillButton>
            <div style={{display:"flex",gap:18,justifyContent:"center",marginTop:16,flexWrap:"wrap"}}>
              <button className="text-btn" onClick={()=>start("rapid")} style={{background:"none",border:"none",color:GREY,fontSize:14,fontWeight:500}}>Mode rapide</button>
              {hasSession&&<button className="text-btn" onClick={()=>start("all","all",{fresh:true})} style={{background:"none",border:"none",color:GREY,fontSize:14}}>Recommencer depuis le début</button>}
            </div>
          </div>

          <div className="home-grid">
            <div>
              {/* Plan d'étude */}
              <SectionLabel icon={TargetIcon}>Plan d'étude</SectionLabel>
              <div className="fade" style={{background:CARD,border:"1px solid "+LINE,borderRadius:20,padding:"22px 24px",boxShadow:SHADOW_CARD,marginBottom:26}}>
                {!plan||!pv ? (
                  <>
                    <p style={{fontSize:15,color:GREY,margin:"0 0 16px",lineHeight:1.45}}>Choisis en combien de jours finir les {ALL.length} questions. On répartit tout pour toi, jour par jour.</p>
                    <PillButton onClick={()=>setPhase("plan")} style={{width:"100%"}}>Créer mon plan</PillButton>
                  </>
                ) : pv.finished ? (
                  <div style={{textAlign:"center"}}>
                    <CheckIcon size={26} stroke={2.5} style={{color:GREEN,margin:"0 auto 10px"}}/>
                    <div style={{fontSize:17,fontWeight:600,letterSpacing:"-0.02em",marginBottom:4}}>Plan terminé</div>
                    <p style={{fontSize:14,color:GREY,margin:"0 0 16px",lineHeight:1.45}}>Tu as vu les {ALL.length} questions. Bravo.</p>
                    <PillButton kind="secondary" onClick={()=>setPhase("plan")}>Voir le plan</PillButton>
                  </div>
                ) : (
                  <>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:12}}>
                      <div style={{fontSize:14,color:INK,fontWeight:500}}>{pv.paused?"En pause":(pv.overdueDays>0?"Jour "+pv.duration+"+":"Jour "+pv.dayNum+" / "+pv.duration)}</div>
                      <div style={{fontSize:13,color:GREY}}>{pv.completedCount} / {pv.total} · {pv.pct}%</div>
                    </div>
                    <div style={{height:6,background:TRACK_BG,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${pv.pct}%`,background:BLUE,borderRadius:3,transition:"width .5s"}}/></div>
                    {pv.paused ? (
                      <PillButton onClick={()=>setPhase("plan")} style={{width:"100%",marginTop:16}}>Reprendre le plan</PillButton>
                    ) : pv.remToday>0 ? (
                      <>
                        {!planCtaShownInHero&&<PillButton onClick={startPlanSession} style={{width:"100%",marginTop:16}}>{planCta?planCta.label:"Commencer la séance"}</PillButton>}
                        {planCtaShownInHero&&<div style={{fontSize:13,color:GREY,marginTop:14}}>C'est ton action du haut de l'écran ↑</div>}
                      </>
                    ) : (
                      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:GREEN_BG,color:GREEN_TEXT,padding:"12px 16px",borderRadius:12,fontSize:14,fontWeight:500,marginTop:16}}>
                        <CheckIcon size={16} stroke={2.5}/>Objectif du jour atteint
                      </div>
                    )}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14}}>
                      <button className="text-btn" onClick={()=>setPhase("plan")} style={{background:"none",border:"none",color:BLUE,fontSize:14,fontWeight:500,padding:0,display:"flex",alignItems:"center",gap:3}}>Voir le plan<ChevronRight size={15}/></button>
                      {pv.revisionIds.length>0&&<button className="text-btn" onClick={startRevisionSession} style={{background:"none",border:"none",color:AMBER_TEXT,fontSize:13,fontWeight:500,padding:0}}>Réviser {pv.revisionIds.length} erreur{pv.revisionIds.length>1?"s":""}</button>}
                    </div>
                  </>
                )}
              </div>

              {/* Pratique */}
              <SectionLabel icon={BookIcon}>Pratique</SectionLabel>
              {resumable&&(
                <div className="fade hcard" onClick={resumeSession} role="button" tabIndex={0} onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); resumeSession(); } }} style={{background:CARD,border:"1px solid "+BLUE,borderRadius:16,padding:"16px 18px",boxShadow:SHADOW_XS,marginBottom:12,cursor:"pointer"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
                      <div style={{width:36,height:36,borderRadius:10,background:QUOTE_BG,color:BLUE,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><RefreshIcon size={18}/></div>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:15,fontWeight:600,letterSpacing:"-0.01em",color:INK}}>Reprendre ma séance</div>
                        <div style={{fontSize:13,color:GREY,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{resumable.label} · {resumable.current+1}/{resumable.total}</div>
                      </div>
                    </div>
                    <ChevronRight size={19} style={{color:BLUE,flexShrink:0}}/>
                  </div>
                  <div style={{height:5,background:TRACK_BG,borderRadius:3,overflow:"hidden",marginTop:12}}><div style={{height:"100%",width:`${Math.round(resumable.current/resumable.total*100)}%`,background:BLUE,borderRadius:3,transition:"width .4s"}}/></div>
                </div>
              )}
              <div className="fade" style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
                <button className="hcard" onClick={()=>start("all","grammar")} style={{flex:"1 1 30%",minWidth:140,background:CARD,border:"1px solid "+LINE,borderRadius:16,padding:"18px 16px",textAlign:"left",boxShadow:SHADOW_XS}}>
                  <div style={{width:32,height:32,borderRadius:9,background:QUOTE_BG,color:BLUE,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:11}}><TypeIcon size={17}/></div>
                  <div style={{fontSize:15,fontWeight:600,letterSpacing:"-0.01em",color:INK,marginBottom:2}}>Structure de la langue</div>
                  {sessionMap["all:grammar"] ? <div style={{fontSize:13,color:BLUE,fontWeight:600}}>En cours · {(sessionMap["all:grammar"].current||0)+1}/{sessionMap["all:grammar"].order.length}</div> : <div style={{fontSize:13,color:GREY}}>{GRAMMAR_COUNT} questions</div>}
                </button>
                <button className="hcard" onClick={()=>start("all","reading")} style={{flex:"1 1 30%",minWidth:140,background:CARD,border:"1px solid "+LINE,borderRadius:16,padding:"18px 16px",textAlign:"left",boxShadow:SHADOW_XS}}>
                  <div style={{width:32,height:32,borderRadius:9,background:QUOTE_BG,color:BLUE,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:11}}><BookIcon size={17}/></div>
                  <div style={{fontSize:15,fontWeight:600,letterSpacing:"-0.01em",color:INK,marginBottom:2}}>Compréhension écrite</div>
                  {sessionMap["all:reading"] ? <div style={{fontSize:13,color:BLUE,fontWeight:600}}>En cours · {(sessionMap["all:reading"].current||0)+1}/{sessionMap["all:reading"].order.length}</div> : <div style={{fontSize:13,color:GREY}}>{READING_COUNT} questions</div>}
                </button>
                <button className="hcard" onClick={()=>start("rapid")} style={{flex:"1 1 30%",minWidth:140,background:CARD,border:"1px solid "+LINE,borderRadius:16,padding:"18px 16px",textAlign:"left",boxShadow:SHADOW_XS}}>
                  <div style={{width:32,height:32,borderRadius:9,background:QUOTE_BG,color:BLUE,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:11}}><ZapIcon size={17}/></div>
                  <div style={{fontSize:15,fontWeight:600,letterSpacing:"-0.01em",color:INK,marginBottom:2}}>Mode rapide</div>
                  <div style={{fontSize:13,color:GREY}}>20 questions mixtes</div>
                </button>
              </div>

              {/* Par niveau — lighter, nested under Pratique rather than its own boxed section */}
              <div className="fade" style={{marginBottom:26}}>
                <div style={{fontSize:13,color:GREY,margin:"4px 0 10px"}}>Ou cible ton niveau (B1–C1 pour le TCF B2) :</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {LEVELS.map(lv=>{
                    const n=levelCounts[lv]||0;
                    const ls=sessionMap["level:"+lv]; // each level keeps its own resumable progress
                    return (
                      <button key={lv} className="hcard" disabled={n===0} onClick={()=>start("level","all",lv)}
                        style={{flex:"1 1 30%",minWidth:82,padding:"12px 8px",borderRadius:12,border:"1px solid "+(ls?LEVEL_COLORS[lv]:(n?LEVEL_COLORS[lv]+"33":LINE)),background:n?LEVEL_BG[lv]:BG,opacity:n?1:0.45,textAlign:"center",cursor:n?"pointer":"default"}}>
                        <div style={{fontSize:15,fontWeight:700,color:n?LEVEL_COLORS[lv]:GREY,letterSpacing:"-0.01em"}}>{lv}</div>
                        {ls ? <div style={{fontSize:11,fontWeight:600,color:LEVEL_COLORS[lv],marginTop:1}}>En cours · {(ls.current||0)+1}/{ls.order.length}</div> : <div style={{fontSize:11,color:GREY,marginTop:1}}>{n}</div>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {(grammarMistakes.length>0||readingMistakes.length>0)&&(
                <div className="fade" style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
                  {grammarMistakes.length>0&&(
                    <div className="hcard" role="button" tabIndex={0} onClick={()=>startPool(shuffle(grammarMistakes),"struggling")} onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); startPool(shuffle(grammarMistakes),"struggling"); } }} style={{background:CARD,border:"1px solid "+LINE,borderRadius:16,padding:"16px 20px",boxShadow:SHADOW_XS,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",gap:12}}>
                      <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
                        <div style={{width:34,height:34,borderRadius:10,background:QUOTE_BG,color:BLUE,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><TypeIcon size={17}/></div>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:15,fontWeight:600,letterSpacing:"-0.01em",color:INK}}>Réviser mes erreurs · Grammaire</div>
                          <div style={{fontSize:13,color:GREY,marginTop:1}}>{grammarMistakes.length} question{grammarMistakes.length>1?"s":""} à revoir</div>
                        </div>
                      </div>
                      <ChevronRight size={19} style={{color:BLUE,flexShrink:0}}/>
                    </div>
                  )}
                  {readingMistakes.length>0&&(
                    <div className="hcard" role="button" tabIndex={0} onClick={()=>startPool(shuffle(readingMistakes),"struggling")} onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); startPool(shuffle(readingMistakes),"struggling"); } }} style={{background:CARD,border:"1px solid "+LINE,borderRadius:16,padding:"16px 20px",boxShadow:SHADOW_XS,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",gap:12}}>
                      <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
                        <div style={{width:34,height:34,borderRadius:10,background:QUOTE_BG,color:BLUE,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><BookIcon size={17}/></div>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:15,fontWeight:600,letterSpacing:"-0.01em",color:INK}}>Réviser mes erreurs · Compréhension</div>
                          <div style={{fontSize:13,color:GREY,marginTop:1}}>{readingMistakes.length} question{readingMistakes.length>1?"s":""} à revoir</div>
                        </div>
                      </div>
                      <ChevronRight size={19} style={{color:BLUE,flexShrink:0}}/>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              {/* Parcours */}
              <SectionLabel icon={TargetIcon}>Mon parcours</SectionLabel>
              <div className="fade hcard" onClick={()=>setPhase("parcours")} role="button" tabIndex={0} onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); setPhase("parcours"); } }} style={{background:CARD,border:"1px solid "+LINE,borderRadius:20,padding:"22px 22px",marginBottom:26,cursor:"pointer",boxShadow:SHADOW_XS}}>
                <div style={{display:"flex",justifyContent:"space-around",textAlign:"center",marginBottom:18}}>
                  {[{v:pct+"%",l:"Réussite",I:TargetIcon},{v:mastered,l:"Maîtrisées",I:CheckIcon},{v:struggling,l:"À revoir",I:RefreshIcon}].map((s,i)=>(
                    <div key={i}>
                      <s.I size={14} stroke={2} style={{color:GREY,margin:"0 auto 5px"}}/>
                      <div style={{fontSize:24,fontWeight:600,letterSpacing:"-0.02em"}}>{s.v}</div>
                      <div style={{fontSize:12,color:GREY,marginTop:2}}>{s.l}</div>
                    </div>
                  ))}
                </div>
                <div style={{height:5,background:TRACK_BG,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${(mastered/ALL.length)*100}%`,background:BLUE,borderRadius:3,transition:"width .5s"}}/></div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12}}>
                  <span style={{fontSize:13,fontWeight:600,color:BLUE,display:"flex",alignItems:"center",gap:3}}>Voir mon parcours<ChevronRight size={15}/></span>
                  {journey.dueToday>0&&<span style={{fontSize:12,fontWeight:600,color:BLUE,background:QUOTE_BG,padding:"4px 10px",borderRadius:8}}>{journey.dueToday} à réviser</span>}
                </div>
              </div>

              {/* Intelligence */}
              <SectionLabel icon={SparkleIcon}>Intelligence</SectionLabel>
              <div className="fade" style={{marginBottom:16}}>
                <p style={{fontSize:13,color:GREY,margin:"0 0 12px",lineHeight:1.45}}>Un tuteur, des questions infinies, des explications sur mesure.</p>
                <div style={{display:"flex",flexDirection:"column",gap:9}}>
                  <button className="hcard" onClick={()=>setShowTutor(true)} style={{width:"100%",padding:"14px 16px",borderRadius:13,border:"1px solid "+LINE,background:CARD,boxShadow:SHADOW_XS,fontSize:15,fontWeight:500,textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center",color:INK}}><span style={{display:"flex",alignItems:"center",gap:9}}><MessageIcon size={16} style={{color:BLUE}}/>Tuteur IA</span><ChevronRight size={17} style={{color:BLUE}}/></button>
                  <button className="hcard" onClick={()=>{ start("ai"); setTimeout(generateAIQuestion,50); }} style={{width:"100%",padding:"14px 16px",borderRadius:13,border:"1px solid "+LINE,background:CARD,boxShadow:SHADOW_XS,fontSize:15,fontWeight:500,textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center",color:INK}}><span style={{display:"flex",alignItems:"center",gap:9}}><SparkleIcon size={16} style={{color:BLUE}}/>Question générée par IA</span><ChevronRight size={17} style={{color:BLUE}}/></button>
                  {aiBank.length>0&&<button className="hcard" onClick={startAIBank} style={{width:"100%",padding:"14px 16px",borderRadius:13,border:"1px solid "+LINE,background:CARD,boxShadow:SHADOW_XS,fontSize:15,fontWeight:500,textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center",color:INK}}><span style={{display:"flex",alignItems:"center",gap:9}}><BookIcon size={16} style={{color:BLUE}}/>Mes questions IA <span style={{color:GREY,fontWeight:400}}>· {aiBank.length}</span></span><ChevronRight size={17} style={{color:BLUE}}/></button>}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ===== AI question loading / error state =====
  // Shown instead of the quiz screen whenever we're mid-fetch for an AI
  // question, or a fetch just failed and left no question to show — so the
  // previous (or an unrelated random) question never lingers on screen.
  if(phase==="quiz"&&mode==="ai"&&(aiLoading||!aiQuestion)){
    return (
      <div style={{minHeight:"100vh",background:BG}}>
        <header style={{position:"sticky",top:0,zIndex:10,background:OVERLAY,backdropFilter:"blur(20px)",borderBottom:"1px solid "+LINE,padding:"calc(env(safe-area-inset-top) + 12px) 22px 12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",maxWidth:600,margin:"0 auto"}}>
            <button className="text-btn" onClick={()=>{setAiQuestion(null);setAiError("");setPhase("home");}} style={{background:"none",border:"none",color:BLUE,fontSize:16,padding:0,display:"flex",alignItems:"center",gap:2}}><ChevronLeft size={19}/>Accueil</button>
            <span style={{fontSize:15,color:GREY,fontWeight:500}}>Question IA</span>
            <div style={{width:20}}/>
          </div>
        </header>
        <main ref={mainRef} tabIndex={-1} style={{outline:"none",maxWidth:480,margin:"0 auto",padding:"22vh 22px 60px",textAlign:"center"}} aria-live="polite">
          {aiLoading
            ? <div className="fade">
                <SparkleIcon size={30} style={{color:BLUE,margin:"0 auto 18px"}}/>
                <div style={{fontSize:18,fontWeight:500,color:INK,marginBottom:8}}><Spinner/></div>
                <p style={{fontSize:15,color:GREY,margin:0}}>Génération d'une question…</p>
              </div>
            : <div className="fade">
                <p style={{fontSize:16,color:INK,margin:"0 0 20px",lineHeight:1.5}}>{aiError||"La génération a échoué."}</p>
                <PillButton onClick={generateAIQuestion}>Réessayer</PillButton>
              </div>}
        </main>
      </div>
    );
  }

  // ===== Quiz =====
  if(phase==="quiz"&&q&&!(mode==="ai"&&(aiLoading||!aiQuestion))){
    const isAI=!!aiQuestion;
    return (
      <div style={{minHeight:"100vh",background:BG}}>
        <header style={{position:"sticky",top:0,zIndex:10,background:OVERLAY,backdropFilter:"blur(20px)",borderBottom:"1px solid "+LINE,padding:"calc(env(safe-area-inset-top) + 12px) 22px 12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",maxWidth:600,margin:"0 auto"}}>
            <button className="text-btn" onClick={()=>{setAiQuestion(null);setPhase("home");}} style={{background:"none",border:"none",color:BLUE,fontSize:16,padding:0,display:"flex",alignItems:"center",gap:2}}><ChevronLeft size={19}/>Accueil</button>
            <span style={{fontSize:15,color:GREY,fontWeight:500}}>{isAI?"Question IA":(current+1)+" sur "+total}</span>
            <button className="text-btn" onClick={()=>setShowTutor(true)} aria-label="Tuteur" style={{background:"none",border:"none",color:BLUE,padding:0,display:"flex"}}><MessageIcon size={20}/></button>
          </div>
          {!isAI&&<div role="progressbar" aria-valuenow={current+1} aria-valuemin={1} aria-valuemax={total} aria-label="Progression du quiz" style={{maxWidth:600,margin:"10px auto 0",height:4,background:TRACK_BG,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${progress}%`,background:BLUE,borderRadius:2,transition:"width .3s"}}/></div>}
        </header>

        <main ref={mainRef} tabIndex={-1} style={{outline:"none",maxWidth:600,margin:"0 auto",padding:"40px 22px 64px"}}>
          <div className="fade" key={isAI?"ai":current} style={{marginBottom:34}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:18}}>
              <div style={{fontSize:13,color:BLUE,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>{isAI||q.aiGenerated?"Générée par IA":(q.type==="reading"?"Compréhension écrite":"Complétez")}</div>
              {q.level&&<span style={{fontSize:11,fontWeight:700,letterSpacing:"0.04em",color:LEVEL_COLORS[q.level],background:LEVEL_BG[q.level],padding:"3px 8px",borderRadius:6}}>{q.level}</span>}
            </div>
            {q.type==="reading"
              ? <>
                  <div style={{background:CARD,border:"1px solid "+LINE,borderRadius:RADIUS,padding:"20px 22px",maxHeight:"42vh",overflowY:"auto",fontSize:16,lineHeight:1.7,color:INK_SOFT,letterSpacing:"-0.01em",whiteSpace:"pre-line",WebkitOverflowScrolling:"touch"}}>{deepExplStructured?highlightPassage(q.passage,deepExplStructured.evidence.map(e=>e.quote)):q.passage}</div>
                  <div style={{fontSize:22,lineHeight:1.4,fontWeight:600,letterSpacing:"-0.02em",textAlign:"center",color:INK,marginTop:24}}>{q.question}</div>
                </>
              : <div style={{fontSize:27,lineHeight:1.48,fontWeight:500,letterSpacing:"-0.02em",textAlign:"center",color:INK}}>{renderSentence(q.sentence)}</div>}
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:13}} role="radiogroup" aria-label="Réponses possibles">
            {q.options.map((opt,i)=>{
              let bg=CARD,border="1px solid "+LINE,color=INK,sh=SHADOW_XS,opacity=1;
              if(selected!==null){
                if(i===q.correct){bg=GREEN_BG;border="1px solid "+GREEN;color=GREEN_TEXT;}
                else if(i===selected){bg=RED_BG;border="1px solid "+RED;color=RED_TEXT;}
                else {bg=CARD;color=GREY;opacity=0.55;}
              } else if(selected===i){border="1px solid "+BLUE;}
              return (<button key={i} className="opt-row" role="radio" aria-checked={selected===i} disabled={selected!==null} onClick={()=>handleSelect(i)} style={{padding:"18px 20px",borderRadius:14,border,background:bg,color,fontSize:17,fontWeight:500,textAlign:"left",display:"flex",alignItems:"center",gap:14,boxShadow:selected===null?sh:"none",letterSpacing:"-0.01em",opacity}}>
                <span style={{width:26,height:26,borderRadius:"50%",border:selected!==null&&(i===q.correct||i===selected)?"none":"1.5px solid "+LINE,background:selected!==null&&i===q.correct?GREEN:selected!==null&&i===selected?RED:"transparent",color:selected!==null&&(i===q.correct||i===selected)?"#fff":GREY,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:600,flexShrink:0}}>{selected!==null&&i===q.correct?<CheckIcon size={14} stroke={3}/>:selected!==null&&i===selected?<XIcon size={14} stroke={3}/>:["A","B","C","D"][i]}</span>
                {opt}
              </button>);
            })}
          </div>

          {selected!==null&&(
            <div className="fade" role="status" aria-live="polite" style={{marginTop:26,background:CARD,borderRadius:RADIUS,padding:24,boxShadow:SHADOW_CARD}}>
              <div style={{fontSize:13,fontWeight:600,color:isWrong?RED:GREEN,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.04em"}}>{isWrong?"À retenir":"Correct"}</div>
              <div style={{fontSize:16,lineHeight:1.6,color:INK,marginBottom:isWrong?16:0,letterSpacing:"-0.01em"}}><strong style={{fontWeight:600}}>« {q.options[q.correct]} »</strong> — {q.rule}</div>
              {isWrong&&q.why&&(<div style={{display:"flex",flexDirection:"column",gap:9,borderTop:"1px solid "+LINE,paddingTop:16}}>{q.options.map((opt,i)=>{ if(i===q.correct||!q.why[i]) return null; return (<div key={i} style={{fontSize:14.5,lineHeight:1.55,color:INK_SOFT}}><span style={{color:RED,fontWeight:600}}>{opt}</span> — {q.why[i]}</div>); })}</div>)}
              {isWrong&&(<div style={{marginTop:16}}>
                {!deepExpl&&!deepExplStructured&&<PillButton kind="secondary" onClick={explainDeeper} disabled={deepLoading} style={{fontSize:14,padding:"10px 18px"}}>{deepLoading?<><Spinner/> Analyse…</>:"Explique-moi plus"}</PillButton>}
                {deepExplStructured&&<div className="fade"><ExplainPlusPanel data={deepExplStructured} q={q} selected={selected}/></div>}
                {!deepExplStructured&&deepExpl&&<div className="fade" style={{marginTop:6,background:BG,borderRadius:12,padding:16,fontSize:15,lineHeight:1.6,color:INK}}><RichText text={deepExpl}/></div>}
              </div>)}
            </div>
          )}

          {selected!==null&&(
            <div className="fade" style={{marginTop:26,textAlign:"center"}}>
              {isAI
                ? <PillButton onClick={()=>{ setAiQuestion(null); setSelected(null); setPhase("home"); }} style={{minWidth:200}}>Terminer</PillButton>
                : <PillButton onClick={next} style={{minWidth:200}}>{current+1>=total?"Voir le résultat":"Continuer"}</PillButton>}
              {isAI&&<div style={{marginTop:14}}><button className="text-btn" onClick={generateAIQuestion} disabled={aiLoading} style={{background:"none",border:"none",color:BLUE,fontSize:15}}>{aiLoading?<Spinner/>:"Une autre question IA"}</button></div>}
            </div>
          )}
        </main>
      </div>
    );
  }

  // ===== Result =====
  if(phase==="result"){
    const pct=Math.round((score/total)*100);
    const title=pct>=80?"Excellent.":pct>=60?"Bien joué.":"Continue.";
    const sub=pct>=80?"Tu es sur la bonne voie pour le B2.":pct>=60?"Encore un peu d'entraînement.":"La régularité paie. On y retourne ?";
    return (
      <div style={{minHeight:"100vh",background:BG,display:"flex",alignItems:"center",justifyContent:"center",padding:"max(24px,env(safe-area-inset-top)) 22px"}}>
        <main ref={mainRef} tabIndex={-1} className="fade" style={{outline:"none",maxWidth:440,width:"100%",textAlign:"center"}}>
          <div style={{fontSize:13,color:BLUE,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:22}}>Résultat</div>
          <ScoreRing pct={pct}/>
          <div style={{fontSize:16,color:GREY,margin:"18px 0 26px"}}>{score} bonnes réponses sur {total}</div>
          <h2 style={{fontSize:30,fontWeight:600,letterSpacing:"-0.03em",margin:"0 0 8px"}}>{title}</h2>
          <p style={{fontSize:17,color:GREY,margin:"0 0 30px",letterSpacing:"-0.01em"}}>{sub}</p>
          <div style={{display:"flex",flexDirection:"column",gap:12,alignItems:"center"}}>
            {(mode==="plan"||mode==="revision")&&plan
              ? <PillButton onClick={()=>setPhase("plan")} style={{minWidth:240}}>Retour au plan</PillButton>
              : <PillButton onClick={()=>start("all")} style={{minWidth:240}}>Recommencer</PillButton>}
            {wrong.length>0&&<PillButton kind="secondary" onClick={()=>setPhase("review")} style={{minWidth:240}}>Revoir mes {wrong.length} erreur{wrong.length>1?"s":""}</PillButton>}
            <button className="text-btn" onClick={()=>setShowTutor(true)} style={{background:"none",border:"none",color:BLUE,fontSize:16,marginTop:4,display:"flex",alignItems:"center",gap:6}}><MessageIcon size={16}/>Réviser avec le tuteur</button>
            <button className="text-btn" onClick={()=>setPhase("home")} style={{background:"none",border:"none",color:GREY,fontSize:15}}>Accueil</button>
          </div>
        </main>
      </div>
    );
  }

  // ===== Review =====
  if(phase==="review"){
    return (
      <div style={{minHeight:"100vh",background:BG,padding:"max(24px,env(safe-area-inset-top)) 22px 60px"}}>
        <main ref={mainRef} tabIndex={-1} style={{outline:"none",maxWidth:600,margin:"0 auto"}}>
          <button className="text-btn" onClick={()=>setPhase("result")} style={{background:"none",border:"none",color:BLUE,fontSize:16,marginBottom:20,padding:0,display:"flex",alignItems:"center",gap:2}}><ChevronLeft size={18}/>Retour</button>
          <h1 style={{fontSize:32,fontWeight:600,letterSpacing:"-0.03em",margin:"0 0 26px"}}>Mes erreurs</h1>
          {wrong.map((w,idx)=>(<div key={idx} className="fade" style={{background:CARD,border:"1px solid "+LINE,borderRadius:RADIUS,padding:24,marginBottom:16,boxShadow:SHADOW_CARD}}>
            <div style={{fontSize:17,lineHeight:1.5,marginBottom:14,color:INK,fontWeight:500,letterSpacing:"-0.01em"}}>{w.type==="reading"?w.question:w.sentence.replace("___","« "+w.options[w.correct]+" »")}</div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
              <span style={{fontSize:13,background:RED_BG,color:RED_TEXT,borderRadius:8,padding:"5px 12px",fontWeight:500}}>Ta réponse : {w.options[w.chosen]}</span>
              <span style={{fontSize:13,background:GREEN_BG,color:GREEN_TEXT,borderRadius:8,padding:"5px 12px",fontWeight:500}}>Correct : {w.options[w.correct]}</span>
            </div>
            <div style={{fontSize:15,lineHeight:1.6,color:INK_SOFT,background:BG,borderRadius:12,padding:16}}>{w.rule}</div>
          </div>))}
          <div style={{textAlign:"center",marginTop:24}}><PillButton onClick={()=>start("all")} style={{minWidth:220}}>Recommencer</PillButton></div>
        </main>
      </div>
    );
  }
  return null;
}

createRoot(document.getElementById("root")).render(<App />);
