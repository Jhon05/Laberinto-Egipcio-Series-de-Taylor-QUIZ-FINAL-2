'use strict';

const COLS = 47;
const ROWS = 25;
const TREASURE_TOTAL = 4;
const QUESTION_STEP_INTERVAL = 20;
const PLAYER_RADIUS = 0.27;
const SPEED_CELLS_PER_SEC = 2.35; // movimiento pausado, fluido y controlado
const MAX_SECURITY_LOCKS = 5;
const MAX_SCORE = 5.0;
const OBSTACLE_TOTAL = 20;
const PORTAL_TOTAL = 10;
const TRAP_TOTAL = 30;
const EXIT_TRANSPORTER_TOTAL = 22;
const EXIT_PORTAL_EXCLUSION_RADIUS = 8;
const EXIT_ACCESS_CORRIDOR_LENGTH = 5;
const EXIT_TRANSPORTER_RING_RADIUS = 5;
const FINAL_CHALLENGE_TOTAL = 3;
const FINAL_CHALLENGE_ICON = '𓏛';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const screens = {
  menu: document.getElementById('menu'),
  game: document.getElementById('game')
};
const hud = {
  score: document.getElementById('scoreHud'),
  treasure: document.getElementById('treasureHud'),
  steps: document.getElementById('stepsHud'),
  difficulty: document.getElementById('difficultyHud'),
  mission: document.getElementById('missionText'),
  log: document.getElementById('eventLog')
};

const questionModal = document.getElementById('questionModal');
const questionTitle = document.getElementById('questionTitle');
const questionBadge = document.getElementById('questionBadge');
const questionText = document.getElementById('questionText');
const hintText = document.getElementById('hintText');
const answerForm = document.getElementById('answerForm');
const feedbackBox = document.getElementById('feedbackBox');
const hintBtn = document.getElementById('hintBtn');
const submitAnswerBtn = document.getElementById('submitAnswerBtn');
const continueBtn = document.getElementById('continueBtn');
const howModal = document.getElementById('howModal');
const endModal = document.getElementById('endModal');
const endTitle = document.getElementById('endTitle');
const endSummary = document.getElementById('endSummary');
const deviceClockValue = document.getElementById('deviceClockValue');
const clockHud = document.getElementById('clockHud');

let selectedAnimal = '🐈';
let tile = 22, offsetX = 0, offsetY = 0;
let lastTime = performance.now();
let activeQuestion = null;
let currentAnswerResult = null;
let pendingAfterQuestion = null;
let gameRunning = false;
let modalOpen = false;
let securityLockActive = false;
let lastSecurityEventAt = 0;

const keys = new Set();
const keyToDir = {
  ArrowUp: {x:0,y:-1}, ArrowDown: {x:0,y:1}, ArrowLeft:{x:-1,y:0}, ArrowRight:{x:1,y:0},
  w:{x:0,y:-1}, W:{x:0,y:-1}, s:{x:0,y:1}, S:{x:0,y:1}, a:{x:-1,y:0}, A:{x:-1,y:0}, d:{x:1,y:0}, D:{x:1,y:0}
};
let currentDir = {x:0,y:0};

const state = {
  grid: [],
  player: {x:1.5,y:1.5},
  start: {x:1,y:1},
  exit: {x:Math.floor(COLS/2), y:Math.floor(ROWS/2)},
  score: 1.0,
  steps: 0,
  lastQuestionStep: 0,
  treasuresFound: 0,
  treasures: [],
  portals: [],
  exitTransporters: [],
  exitSafeKeys: new Set(),
  finalChallengeCells: new Set(),
  exitAccessCell: null,
  obstacles: new Set(),
  bonusCells: new Set(),
  trapCells: new Set(),
  answered: [],
  log: [],
  visitedCell: '',
  startedAt: null,
  finishedAt: null,
  security: { locks:0, fullscreenExits:0, focusLosses:0, hiddenTabs:0, escapeKey:0, rightClicks:0, printScreen:0, blockedShortcuts:0, wrongTeacherCodes:0 },
  cancelled: false
};

const TREASURE_ICONS = ['🏺','💎','👑','📿'];
const TREASURE_NAMES = ['Ánfora de Alejandría','Zafiro del Nilo','Corona de Ra','Collar de Isis'];
const OBSTACLE_ICONS = ['𓉐','𓃭','𓅓','𓊹','𓂧','𓁹'];
const PORTAL_ICON = '🌀';
const EXIT_TRANSPORTER_ICON = '𓊽';
const BONUS_ICON = '𓆣';
const TRAP_ICON = '𓋹';

const QUESTIONS_PER_TYPE = 10000;
const QUESTION_TYPE_TOTALS = {
  tf: QUESTIONS_PER_TYPE,
  statements: QUESTIONS_PER_TYPE,
  integer: QUESTIONS_PER_TYPE,
  choice: QUESTIONS_PER_TYPE
};
const QUESTION_BANK_TOTAL = Object.values(QUESTION_TYPE_TOTALS).reduce((a,b)=>a+b,0);
const STATEMENT_OPTIONS = ['Solo I','Solo II','Solo III','I y II','I y III','II y III','I, II y III','Ninguna'];
const TOPICS = ['Serie geométrica','Radio de convergencia','Intervalo de convergencia','Taylor','Maclaurin','Derivar series','Integrar series','Aproximación de funciones'];
const questionBank = buildQuestionBank();


// Utilidades esenciales del motor del juego.
// En la versión anterior estas funciones quedaron ausentes y por eso el botón
// “Entrar a la pirámide” podía mostrar un error antes de iniciar el laberinto.
function randInt(n){
  const m = Math.max(0, Math.floor(Number(n) || 0));
  return m <= 0 ? 0 : Math.floor(Math.random() * m);
}
function clamp(value, min, max){
  const v = Number(value);
  if(Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}
function keyOf(x,y){ return `${Math.floor(x)},${Math.floor(y)}`; }
function cellOf(pos){
  return {
    x: clamp(Math.floor(pos.x), 0, COLS - 1),
    y: clamp(Math.floor(pos.y), 0, ROWS - 1)
  };
}
function showScreen(name){
  Object.entries(screens).forEach(([key,screen]) => {
    if(!screen) return;
    if(key === name) screen.classList.add('active');
    else screen.classList.remove('active');
  });
}

function buildQuestionBank(){
  // Banco virtual/lazy: no se construyen 40.000 objetos al cargar la página.
  // Cada pregunta se genera al momento de necesitarse, usando índices de 0 a 9.999 por tipo.
  // Esto conserva 10.000 posibilidades por tipo sin bloquear el botón de inicio.
  return {
    mode: 'lazy',
    perType: QUESTIONS_PER_TYPE,
    types: ['tf','statements','integer','choice'],
    total: QUESTION_BANK_TOTAL
  };
}
function makeGeneratedQuestion(type,i){
  if(type === 'tf') return makeTFQuestion(i);
  if(type === 'statements') return makeStatementsQuestion(i);
  if(type === 'integer') return makeIntegerQuestion(i);
  return makeChoiceQuestion(i);
}
function difficultyFor(i,shift=0){
  const levels = ['basico','medio','avanzado','experto','bono'];
  return levels[(i + shift) % levels.length];
}
function valueFrom(i, mult, mod, add=0){ return ((i * mult + add) % mod); }
function signedCenter(i){ return valueFrom(i,7,13) - 6; }
function positiveA(i){ return 2 + valueFrom(i,5,9); }
function positiveB(i){ return 1 + valueFrom(i,11,7); }
function binomial(n,k){
  if(k<0 || k>n) return 0;
  k = Math.min(k,n-k);
  let r=1;
  for(let j=1;j<=k;j++) r = Math.round(r * (n-k+j) / j);
  return r;
}
function statementAnswer(flags){
  const names = ['I','II','III'];
  const chosen = flags.map((v,i)=>v ? names[i] : null).filter(Boolean);
  if(chosen.length===0) return 'Ninguna';
  if(chosen.length===3) return 'I, II y III';
  if(chosen.length===1) return `Solo ${chosen[0]}`;
  return chosen.join(' y ');
}
function shuffledOptions(options){ return shuffle(options).map(String); }
function intervalText(left,right,leftClosed,rightClosed){
  return `\\(${leftClosed?'[':'('}${left},${right}${rightClosed?']':')'}\\)`;
}
function questionId(prefix,i,extra=''){
  return `${prefix}-${String(i+1).padStart(5,'0')}-${extra}`;
}
function makeTFQuestion(i){
  const t = i % 10;
  const diff = difficultyFor(i,0);
  const c = signedCenter(i);
  const a = positiveA(i);
  const b = positiveB(i);
  const n = 2 + valueFrom(i,3,5);
  const truth = valueFrom(i,37,2) === 0;
  const topic = TOPICS[valueFrom(i,13,TOPICS.length)];
  let prompt='', hint='', solution='', answer = truth ? 'Verdadero' : 'Falso', title='Verdadero o falso';

  if(t===0){
    const claimed = truth ? a : a + 1 + valueFrom(i,2,3);
    prompt = `Determina si la afirmación es verdadera o falsa: la serie de potencias \\[\\sum_{n=0}^{\\infty}\\left(\\frac{x-${c}}{${a}}\\right)^n\\] tiene radio de convergencia \\(R=${claimed}\\).`;
    hint = `Reconoce primero la razón geométrica \\(r=\\frac{x-${c}}{${a}}\\). La condición de convergencia se obtiene imponiendo \\(|r|<1\\). No sustituyas valores particulares de \\(x\\); despeja la desigualdad absoluta.`;
    solution = `La razón es \\(r=\\frac{x-${c}}{${a}}\\). La serie geométrica converge si \\(|r|<1\\), es decir \\(|x-${c}|<${a}\\). Por tanto, el radio correcto es \\(R=${a}\\). La afirmación propuesta ${truth?'coincide con ese resultado':'no coincide con ese resultado'}.`;
  } else if(t===1){
    const k = 1 + valueFrom(i,5,5);
    const claimedNumerator = truth ? `${k}^{n}` : `${k}^{n+1}`;
    prompt = `Decide si es verdadera o falsa la afirmación: en la serie de Maclaurin de \\(e^{${k}x}\\), el numerador entero del coeficiente de \\(x^{${n}}\\), escrito como \\(\\frac{\\boxed{\;} }{${n}!}\\), es \\(${claimedNumerator}\\).`;
    hint = `Parte de \\(e^u=\\sum_{m=0}^{\\infty}\\frac{u^m}{m!}\\) y sustituye \\(u=${k}x\\). Luego identifica únicamente el término con potencia \\(x^{${n}}\\).`;
    solution = `Como \\(e^{${k}x}=\\sum_{m=0}^{\\infty}\\frac{(${k}x)^m}{m!}=\\sum_{m=0}^{\\infty}\\frac{${k}^m x^m}{m!}\\), el numerador entero asociado al coeficiente de \\(x^{${n}}\\) es \\(${k}^{${n}}\\). La afirmación ${truth?'usa ese numerador':'usa un numerador distinto'} y por eso es ${answer.toLowerCase()}.`;
  } else if(t===2){
    const func = valueFrom(i,4,2)===0 ? 'sin' : 'cos';
    const parityClaim = truth ? (func==='sin'?'potencias impares':'potencias pares') : (func==='sin'?'potencias pares':'potencias impares');
    const ftex = func==='sin' ? '\\sin x' : '\\cos x';
    prompt = `Determina si la afirmación es verdadera o falsa: la serie de Maclaurin de \\(${ftex}\\) contiene solamente ${parityClaim}.`;
    hint = `Relaciona la paridad de la función con los términos de su serie. Las funciones impares producen potencias impares y las funciones pares producen potencias pares alrededor de \\(0\\).`;
    solution = `La función \\(${ftex}\\) es ${func==='sin'?'impar':'par'}. Por tanto, su serie de Maclaurin contiene potencias ${func==='sin'?'impares':'pares'}. La afirmación ${truth?'describe correctamente':'no describe correctamente'} esa estructura.`;
  } else if(t===3){
    const p = 1 + valueFrom(i,7,3);
    const claimedBoth = truth ? (p>1) : !(p>1);
    prompt = `Sea \\[\\sum_{n=1}^{\\infty}\\frac{(x-${c})^n}{${a}^n n^{${p}}}.\\] Decide si la afirmación es verdadera o falsa: la serie converge en ambos extremos de su intervalo de convergencia.`;
    hint = `Primero escribe la potencia como \\(\\left(\\frac{x-${c}}{${a}}\\right)^n\\). En los extremos aparecen series tipo \\(p\\)-armónica y alternante; por eso los extremos se revisan por separado.`;
    solution = `El radio es \\(R=${a}\\). En el extremo derecho queda \\(\\sum 1/n^{${p}}\\), que converge solo si \\(${p}>1\\). En el extremo izquierdo queda una serie alternante \\(\\sum (-1)^n/n^{${p}}\\), que converge para \\(${p}>0\\). Por tanto, la convergencia en ambos extremos ocurre exactamente cuando \\(${p}>1\\). La afirmación dada es ${claimedBoth?'verdadera':'falsa'}.`;
    answer = claimedBoth ? 'Verdadero' : 'Falso';
  } else if(t===4){
    const claimed = truth ? 'no cambia' : 'se duplica';
    prompt = `Decide si es verdadera o falsa la afirmación: al derivar término a término una serie de potencias con radio finito \\(R\\), el radio de convergencia ${claimed}.`;
    hint = `Recuerda un resultado estructural: derivar o integrar una serie de potencias no cambia su radio de convergencia, aunque sí puede cambiar el comportamiento en los extremos.`;
    solution = `Si \\(\\sum a_n(x-c)^n\\) tiene radio \\(R\\), entonces la serie derivada \\(\\sum n a_n(x-c)^{n-1}\\) conserva el mismo radio \\(R\\). Lo que puede cambiar son los extremos. Por eso la afirmación es ${answer.toLowerCase()}.`;
  } else if(t===5){
    const sign = truth ? '+' : '-';
    prompt = `Determina si la afirmación es verdadera o falsa: integrando término a término la serie geométrica de \\(\\frac{1}{1+x}\\) se obtiene \\[\\ln(1+x)=\\sum_{n=1}^{\\infty}(-1)^{n+1}\\frac{x^n}{n},\\quad |x|<1.\\]`;
    hint = `Observa que \\(\\frac{d}{dx}\\ln(1+x)=\\frac{1}{1+x}\\). La integral debe hacerse desde \\(0\\) hasta \\(x\\) para que la constante sea correcta.`;
    solution = `Como \\(\\frac{1}{1+x}=\\sum_{n=0}^{\\infty}(-1)^n x^n\\), al integrar desde \\(0\\) hasta \\(x\\) se obtiene \\(\\ln(1+x)=\\sum_{n=1}^{\\infty}(-1)^{n+1}\\frac{x^n}{n}\\). La afirmación es verdadera.`;
    answer = 'Verdadero';
  } else if(t===6){
    const shift = 1 + valueFrom(i,5,4);
    const target = shift + 2 + valueFrom(i,3,5);
    const claimed = truth ? 1 : 0;
    prompt = `Decide si es verdadera o falsa la afirmación: en \\[\\frac{x^{${shift}}}{1-x}=x^{${shift}}+x^{${shift+1}}+x^{${shift+2}}+\\cdots,\\] el coeficiente de \\(x^{${target}}\\) es \\(${claimed}\\).`;
    hint = `Multiplicar por \\(x^{${shift}}\\) desplaza todos los exponentes. Luego verifica si el exponente pedido aparece en la lista de potencias.`;
    solution = `La expansión es \\(x^{${shift}}+x^{${shift+1}}+x^{${shift+2}}+\\cdots\\). Como \\(${target}\\ge ${shift}\\), el término \\(x^{${target}}\\) aparece con coeficiente \\(1\\). Por tanto, la afirmación es ${truth?'verdadera':'falsa'}.`;
  } else if(t===7){
    const m = 1 + valueFrom(i,3,5);
    const claimed = truth ? a : a*m;
    prompt = `Determina si la afirmación es verdadera o falsa: la serie \\[\\sum_{n=1}^{\\infty} n^{${m}}\\left(\\frac{x+${Math.abs(c)}}{${a}}\\right)^n\\] tiene radio de convergencia \\(R=${claimed}\\).`;
    hint = `El factor polinomial \\(n^{${m}}\\) no cambia el radio determinado por la razón geométrica \\(\\frac{x+${Math.abs(c)}}{${a}}\\).`;
    solution = `La condición de radio viene de \\(|(x+${Math.abs(c)})/${a}|<1\\), por lo que \\(R=${a}\\). El factor \\(n^{${m}}\\) afecta los extremos, pero no el radio. La afirmación es ${answer.toLowerCase()}.`;
  } else if(t===8){
    const func = valueFrom(i,2,2)===0 ? 'e^x' : '\\frac{1}{1-x}';
    const claimed = truth ? 'converge para todo \\(x\\)' : 'tiene radio \\(R=1\\)';
    const correct = func==='e^x' ? 'converge para todo \\(x\\)' : 'tiene radio \\(R=1\\)';
    prompt = `Decide si la afirmación es verdadera o falsa: la serie de Maclaurin de \\(${func}\\) ${claimed}.`;
    hint = `Compara dos series conocidas: \\(e^x\\) tiene radio infinito, mientras que la serie geométrica de \\(1/(1-x)\\) exige \\(|x|<1\\).`;
    solution = `Para \\(${func}\\), la descripción correcta es: ${correct}. La afirmación propuesta ${truth?'coincide':'no coincide'} con ese hecho.`;
  } else {
    const deg = 2 + valueFrom(i,9,5);
    const claimed = truth ? deg : deg+1;
    prompt = `Verdadero o falso: el polinomio de Taylor de grado \\(${deg}\\) de una función alrededor de \\(0\\) contiene términos hasta la potencia \\(x^{${claimed}}\\).`;
    hint = `La palabra grado indica la mayor potencia permitida. No confundas el número de términos con el grado máximo.`;
    solution = `Un polinomio de Taylor de grado \\(${deg}\\) contiene potencias desde \\(x^0\\) hasta, como máximo, \\(x^{${deg}}\\). La afirmación es ${truth?'verdadera':'falsa'}.`;
  }
  return {id:questionId('tf',i,`${t}-${diff}`), difficulty:diff, type:'tf', topic, title, prompt, options:['Verdadero','Falso'], answer, hint, solution};
}
function makeStatementsQuestion(i){
  const t = i % 8;
  const diff = difficultyFor(i,1);
  const c = signedCenter(i);
  const a = positiveA(i);
  const p = 1 + valueFrom(i,7,3);
  const k = 1 + valueFrom(i,3,5);
  let prompt='', hint='', solution='', flags=[true,false,true], topic=TOPICS[valueFrom(i,17,TOPICS.length)];
  const title = 'Afirmaciones I, II y III';
  if(t===0){
    flags = [true,true,p>1];
    prompt = `Para la serie \\[\\sum_{n=1}^{\\infty}\\frac{(x-${c})^n}{${a}^n n^{${p}}},\\] decide cuáles afirmaciones son verdaderas.\\[\\text{I. El centro es }x=${c}.\\]\\[\\text{II. El radio de convergencia es }R=${a}.\\]\\[\\text{III. La serie converge en ambos extremos.}\\]`;
    hint = `Identifica centro y radio a partir de \\(\\left(\\frac{x-${c}}{${a}}\\right)^n\\). Después revisa los extremos sustituyendo los valores límite.`;
    solution = `I es verdadera porque la potencia está centrada en \\(x=${c}\\). II es verdadera porque \\(|x-${c}|<${a}\\). III es ${flags[2]?'verdadera':'falsa'}: en el extremo derecho queda \\(\\sum 1/n^{${p}}\\), que converge solo si \\(${p}>1\\).`;
  } else if(t===1){
    const func = valueFrom(i,5,2)===0 ? 'sin' : 'cos';
    flags = func==='sin' ? [true,true,false] : [true,false,true];
    const ftex = func==='sin' ? '\\sin x' : '\\cos x';
    prompt = `Sobre la serie de Maclaurin de \\(${ftex}\\), decide cuáles afirmaciones son verdaderas.\\[\\text{I. La serie alterna signos.}\\]\\[\\text{II. Contiene potencias impares.}\\]\\[\\text{III. Contiene potencias pares.}\\]`;
    hint = `Recuerda la paridad de \\(${ftex}\\) y escribe los primeros tres términos de su serie antes de decidir.`;
    solution = `La serie de \\(${ftex}\\) alterna signos. Si la función es \\(\\sin x\\), aparecen potencias impares; si es \\(\\cos x\\), aparecen potencias pares. Por eso las verdaderas son ${statementAnswer(flags)}.`;
  } else if(t===2){
    flags = [true,true,false];
    prompt = `A partir de \\[\\frac{1}{1-x}=\\sum_{n=0}^{\\infty}x^n,\\quad |x|<1,\\] decide cuáles afirmaciones son verdaderas.\\[\\text{I. }\\frac{1}{(1-x)^2}=\\sum_{n=1}^{\\infty}n x^{n-1}.\\]\\[\\text{II. }\\frac{1}{(1-x)^2}=\\sum_{n=0}^{\\infty}(n+1)x^n.\\]\\[\\text{III. El radio cambia a }R=2.\\]`;
    hint = `Deriva término a término y luego reindexa. La derivación cambia exponentes y coeficientes, pero no el radio de convergencia.`;
    solution = `I es verdadera por derivación término a término. II es la misma serie reindexada. III es falsa porque derivar una serie de potencias conserva el radio \\(R=1\\).`;
  } else if(t===3){
    const s = 1 + valueFrom(i,11,4);
    const target = s + valueFrom(i,7,6);
    flags = [target>=s, true, false];
    prompt = `Para \\[\\frac{x^{${s}}}{1-x}=\\sum_{n=0}^{\\infty}x^{n+${s}},\\] decide cuáles afirmaciones son verdaderas.\\[\\text{I. El coeficiente de }x^{${target}}\\text{ es }1.\\]\\[\\text{II. La multiplicación por }x^{${s}}\\text{ desplaza la serie.}\\]\\[\\text{III. El radio de convergencia es }R=${s+1}.\\]`;
    hint = `Observa el menor exponente de la serie después del desplazamiento. Luego recuerda que multiplicar por una potencia no cambia el radio de la serie geométrica.`;
    solution = `I es ${flags[0]?'verdadera':'falsa'} porque el exponente pedido ${flags[0]?'sí':'no'} aparece después del desplazamiento. II es verdadera. III es falsa: el radio sigue siendo \\(R=1\\).`;
  } else if(t===4){
    flags = [true, p>1, true];
    prompt = `Para \\[\\sum_{n=1}^{\\infty}\\frac{(x+${Math.abs(c)})^n}{${a}^n n^{${p}}},\\] decide cuáles afirmaciones son verdaderas.\\[\\text{I. La condición inicial es }|x+${Math.abs(c)}|<${a}.\\]\\[\\text{II. En el extremo derecho converge.}\\]\\[\\text{III. En el extremo izquierdo converge por alternancia.}\\]`;
    hint = `No basta con hallar el radio. Sustituye cada extremo y compara con una serie \\(p\\)-armónica o alternante.`;
    solution = `I es verdadera. En el extremo derecho aparece \\(\\sum 1/n^{${p}}\\), que converge solo si \\(${p}>1\\). En el extremo izquierdo aparece \\(\\sum (-1)^n/n^{${p}}\\), que converge por Leibniz para \\(${p}>0\\).`;
  } else if(t===5){
    flags = [true, true, false];
    prompt = `Sobre el polinomio de Maclaurin de \\(e^{${k}x}\\), decide cuáles afirmaciones son verdaderas.\\[\\text{I. }e^{${k}x}=\\sum_{n=0}^{\\infty}\\frac{${k}^n x^n}{n!}.\\]\\[\\text{II. El coeficiente de }x^2\\text{ es }\\frac{${k*k}}{2}.\\]\\[\\text{III. El radio de convergencia es }R=${k}.\\]`;
    hint = `Sustituye \\(u=${k}x\\) en la serie de \\(e^u\\). Recuerda que las series exponenciales tienen radio infinito.`;
    solution = `I y II son verdaderas. III es falsa porque la serie de \\(e^{${k}x}\\) converge para todo \\(x\\), por tanto su radio es infinito.`;
  } else if(t===6){
    flags = [true,false,true];
    prompt = `Sobre \\[\\ln(1+x)=\\sum_{n=1}^{\\infty}(-1)^{n+1}\\frac{x^n}{n},\\] decide cuáles afirmaciones son verdaderas.\\[\\text{I. Se obtiene integrando la serie de }\\frac{1}{1+x}.\\]\\[\\text{II. Su radio de convergencia es }R=2.\\]\\[\\text{III. En }x=1\\text{ converge.}\\]`;
    hint = `Recuerda que \\(\\ln(1+x)\\) viene de integrar \\(1/(1+x)\\). Después analiza los extremos \\(x=1\\) y \\(x=-1\\).`;
    solution = `I es verdadera. II es falsa porque el radio es \\(R=1\\). III es verdadera porque en \\(x=1\\) queda la serie armónica alternante, que converge.`;
  } else {
    flags = [true, valueFrom(i,19,2)===0, false];
    const claimedTerm = flags[1] ? `\\frac{x^{${nFor(i)}}}{${nFor(i)}!}` : `\\frac{x^{${nFor(i)+1}}}{${nFor(i)}!}`;
    prompt = `Para aproximaciones de Taylor alrededor de \\(0\\), decide cuáles afirmaciones son verdaderas.\\[\\text{I. El grado máximo controla la última potencia permitida.}\\]\\[\\text{II. El término }${claimedTerm}\\text{ puede aparecer como término de una serie exponencial.}\\]\\[\\text{III. La pista de una pregunta siempre determina la respuesta sin calcular.}\\]`;
    hint = `Lee cada afirmación como una proposición independiente. No uses la pista como sustituto del procedimiento matemático.`;
    solution = `I es verdadera. II depende de si el exponente y el factorial corresponden al mismo índice de la serie exponencial; aquí es ${flags[1]?'verdadera':'falsa'}. III es falsa porque la pista orienta, pero no debe revelar ni reemplazar el cálculo.`;
  }
  const answer = statementAnswer(flags);
  return {id:questionId('st',i,`${t}-${diff}`), difficulty:diff, type:'statements', topic, title, prompt, options:shuffledOptions(STATEMENT_OPTIONS), answer, hint, solution};
}
function nFor(i){ return 2 + valueFrom(i,7,5); }
function makeIntegerQuestion(i){
  const t = i % 10;
  const diff = difficultyFor(i,2);
  const c = signedCenter(i);
  const a = positiveA(i);
  const k = 1 + valueFrom(i,5,5);
  const n = 2 + valueFrom(i,3,5);
  let prompt='', hint='', solution='', answer=0, topic=TOPICS[valueFrom(i,19,TOPICS.length)];
  const title = 'Valor entero';
  if(t===0){
    answer = a;
    prompt = `Encuentra el radio de convergencia de la serie \\[\\sum_{n=0}^{\\infty} n^{${k}}\\left(\\frac{x-${c}}{${a}}\\right)^n.\\] Escribe solo el número entero.`;
    hint = `El factor \\(n^{${k}}\\) afecta los extremos, pero el radio lo determina la razón \\(\\frac{x-${c}}{${a}}\\).`;
    solution = `La condición principal es \\(|(x-${c})/${a}|<1\\), equivalente a \\(|x-${c}|<${a}\\). Por tanto, el radio de convergencia es \\(R=${a}\\).`;
  } else if(t===1){
    answer = c;
    prompt = `La serie \\[\\sum_{n=0}^{\\infty} a_n (x-${c})^n\\] está escrita alrededor de un centro. ¿Cuál es ese centro? Escribe solo el entero.`;
    hint = `Compara \\(x-${c}\\) con la forma estándar \\(x-c_0\\). El centro es el número que hace cero la expresión dentro de la potencia.`;
    solution = `La forma estándar es \\(\\sum a_n(x-c_0)^n\\). Aquí \\(c_0=${c}\\), por eso el centro es \\(${c}\\).`;
  } else if(t===2){
    const s = 1 + valueFrom(i,7,4);
    const r = 2 + valueFrom(i,5,3);
    const m = s + 2 + valueFrom(i,11,6);
    const j = m-s;
    answer = binomial(j+r-1,r-1);
    prompt = `Halla el coeficiente entero de \\(x^{${m}}\\) en \\[\\frac{x^{${s}}}{(1-x)^{${r}}}.\\] Escribe solo el entero.`;
    hint = `Usa \\(\\frac{1}{(1-x)^r}=\\sum_{j=0}^{\\infty}\\binom{j+r-1}{r-1}x^j\\). Luego compensa el desplazamiento producido por \\(x^{${s}}\\).`;
    solution = `Al multiplicar por \\(x^{${s}}\\), el término \\(x^{${m}}\\) viene de \\(x^{${j}}\\) en \\(1/(1-x)^{${r}}\\). Su coeficiente es \\(\\binom{${j}+${r}-1}{${r}-1}=\\binom{${j+r-1}}{${r-1}}=${answer}\\).`;
  } else if(t===3){
    answer = Math.pow(k,n);
    prompt = `En la serie de Maclaurin de \\(e^{${k}x}\\), calcula el entero \\(n!\\) multiplicado por el coeficiente de \\(x^{${n}}\\). Escribe solo el entero.`;
    hint = `Escribe \\(e^{${k}x}=\\sum_{m=0}^{\\infty}\\frac{${k}^m x^m}{m!}\\). Al multiplicar el coeficiente por \\(${n}!\\), desaparece el factorial.`;
    solution = `El coeficiente de \\(x^{${n}}\\) es \\(\\frac{${k}^{${n}}}{${n}!}\\). Al multiplicarlo por \\(${n}!\\), queda \\(${k}^{${n}}=${answer}\\).`;
  } else if(t===4){
    const m = 2 + valueFrom(i,7,6);
    const deg = m * (2 + valueFrom(i,3,5));
    answer = Math.floor(deg/m)+1;
    prompt = `Usando \\[\\frac{1}{1-x^${m}}=1+x^${m}+x^{${2*m}}+x^{${3*m}}+\\cdots,\\] ¿cuántos términos no nulos aparecen hasta grado \\(${deg}\\)? Escribe solo el entero.`;
    hint = `Cuenta los múltiplos de \\(${m}\\) desde \\(0\\) hasta \\(${deg}\\), incluyendo ambos extremos.`;
    solution = `Los exponentes son \\(0,${m},${2*m},${3*m},\\ldots\\). Hasta \\(${deg}\\) hay \\(\\lfloor ${deg}/${m}\\rfloor+1=${answer}\\) términos no nulos.`;
  } else if(t===5){
    const r = 1 + valueFrom(i,13,5);
    answer = 2*r;
    prompt = `La serie \\[\\sum_{n=1}^{\\infty}\\frac{(x-${c})^n}{n ${r}^n}\\] tiene radio \\(R=${r}\\). ¿Cuál es la longitud del intervalo abierto de convergencia antes de revisar extremos? Escribe solo el entero.`;
    hint = `Un intervalo abierto centrado en \\(${c}\\) y radio \\(${r}\\) va de \\(${c-r}\\) a \\(${c+r}\\). Su longitud es dos veces el radio.`;
    solution = `La longitud del intervalo abierto es \\(2R=2(${r})=${answer}\\).`;
  } else if(t===6){
    const m = 2 + valueFrom(i,17,6);
    answer = m;
    prompt = `En la función \\(f(x)=x^{${m}}+x^{${m+2}}+x^{${m+4}}+\\cdots\\), ¿cuál es el menor orden de derivada que puede ser no cero en \\(x=0\\)? Escribe solo el entero.`;
    hint = `La primera potencia no nula determina la primera derivada que puede sobrevivir al evaluar en \\(0\\).`;
    solution = `El primer término es \\(x^{${m}}\\). Todas las derivadas de orden menor se anulan en \\(0\\). La derivada de orden \\(${m}\\) puede ser no cero. Por tanto, la respuesta es \\(${m}\\).`;
  } else if(t===7){
    const p = 2 + valueFrom(i,13,5);
    answer = p;
    prompt = `Para \\(\\frac{1}{1-${p}x}\\), encuentra el radio de convergencia de su serie geométrica de Maclaurin. Si el radio es \\(1/${p}\\), escribe solamente el denominador entero.`;
    hint = `Escribe \\(\\frac{1}{1-${p}x}=\\sum (${p}x)^n\\). La condición es \\(|${p}x|<1\\).`;
    solution = `La condición es \\(|${p}x|<1\\), por lo que \\(|x|<1/${p}\\). El denominador entero pedido es \\(${p}\\).`;
  } else if(t===8){
    const m = 1 + valueFrom(i,7,5);
    answer = m+1;
    prompt = `Al integrar término a término \\(x^{${m}}\\), ¿cuál es el denominador entero del nuevo término \\(\\frac{x^{${m+1}}}{\\boxed{\;}}\\)? Escribe solo el entero.`;
    hint = `Usa la regla \\(\\int x^m dx = x^{m+1}/(m+1)\\), sin olvidar que se trata de una integración término a término.`;
    solution = `La integral de \\(x^{${m}}\\) es \\(\\frac{x^{${m+1}}}{${m+1}}\\). Por tanto, el denominador entero es \\(${m+1}\\).`;
  } else {
    const m = 1 + valueFrom(i,3,5);
    const q = 2 + valueFrom(i,5,5);
    answer = m*q;
    prompt = `Si una aproximación usa el término \\(\\frac{(${m}x)^{${q}}}{${q}!}\\), ¿cuál es el exponente total de \\(x\\) multiplicado por el coeficiente entero de la base? Escribe el producto entero \\(${m}\\cdot ${q}\\).`;
    hint = `No calcules el coeficiente completo. La pregunta pide el producto entre el número que multiplica a \\(x\\) dentro del paréntesis y el exponente del término.`;
    solution = `El número que multiplica a \\(x\\) es \\(${m}\\) y el exponente es \\(${q}\\). El producto pedido es \\(${m}\\cdot ${q}=${answer}\\).`;
  }
  return {id:questionId('int',i,`${t}-${diff}`), difficulty:diff, type:'integer', topic, title, prompt, answer:String(answer), hint, solution};
}
function makeChoiceQuestion(i){
  const t = i % 8;
  const diff = difficultyFor(i,3);
  const c = signedCenter(i);
  const a = positiveA(i);
  const p = 1 + valueFrom(i,5,3);
  const topic = TOPICS[valueFrom(i,23,TOPICS.length)];
  let prompt='', hint='', solution='', answer='', options=[], title='Selección múltiple';
  if(t===0){
    const L = c-a, R = c+a;
    const leftClosed = true;
    const rightClosed = p>1;
    answer = intervalText(L,R,leftClosed,rightClosed);
    options = shuffledOptions([answer, intervalText(L,R,false,false), intervalText(L,R,true,true), intervalText(L,R,false,true), intervalText(c,R,leftClosed,rightClosed), intervalText(L,c,leftClosed,rightClosed)]);
    prompt = `Selecciona el intervalo de convergencia de \\[\\sum_{n=1}^{\\infty}\\frac{(x-${c})^n}{${a}^n n^{${p}}}.\\]`;
    hint = `Primero halla \\(|x-${c}|<${a}\\). Después revisa por separado el extremo izquierdo y el extremo derecho; no supongas que ambos se comportan igual.`;
    solution = `La condición radial da \\(${L}<x<${R}\\). En \\(x=${L}\\) aparece una serie alternante \\(\\sum (-1)^n/n^{${p}}\\), que converge. En \\(x=${R}\\) aparece \\(\\sum 1/n^{${p}}\\), que ${p>1?'converge':'diverge'}. Por tanto, el intervalo correcto es ${answer}.`;
  } else if(t===1){
    const deg = 4;
    answer = `\\(1-\\frac{x^2}{2!}+\\frac{x^4}{4!}\\)`;
    options = shuffledOptions([answer, `\\(1+x+\\frac{x^2}{2!}+\\frac{x^3}{3!}\\)`, `\\(x-\\frac{x^3}{3!}+\\frac{x^5}{5!}\\)`, `\\(1-\\frac{x}{2!}+\\frac{x^2}{4!}\\)`, `\\(1+\\frac{x^2}{2!}+\\frac{x^4}{4!}\\)`]);
    prompt = `Selecciona el polinomio de Maclaurin de grado \\(4\\) para \\(\\cos x\\).`;
    hint = `Recuerda que \\(\\cos x\\) es par y sus signos alternan. Deben aparecer potencias pares hasta \\(x^4\\).`;
    solution = `La serie es \\(\\cos x=1-\\frac{x^2}{2!}+\\frac{x^4}{4!}-\\cdots\\). Hasta grado \\(4\\), el polinomio correcto es ${answer}.`;
  } else if(t===2){
    answer = `\\(x-\\frac{x^3}{3!}+\\frac{x^5}{5!}\\)`;
    options = shuffledOptions([answer, `\\(1-\\frac{x^2}{2!}+\\frac{x^4}{4!}\\)`, `\\(x+\\frac{x^3}{3!}+\\frac{x^5}{5!}\\)`, `\\(x-\\frac{x^2}{2!}+\\frac{x^3}{3!}\\)`, `\\(1+x+\\frac{x^2}{2!}\\)`]);
    prompt = `Selecciona el polinomio de Maclaurin de grado \\(5\\) para \\(\\sin x\\).`;
    hint = `La función \\(\\sin x\\) es impar. Por eso no debe aparecer término constante ni potencias pares.`;
    solution = `La serie de Maclaurin es \\(\\sin x=x-\\frac{x^3}{3!}+\\frac{x^5}{5!}-\\cdots\\). El polinomio de grado \\(5\\) es ${answer}.`;
  } else if(t===3){
    const m = 2 + valueFrom(i,7,5);
    answer = `\\(-\\frac{x^{${2*m+1}}}{${2*m+1}!}\\)`;
    options = shuffledOptions([answer, `\\(\\frac{x^{${2*m}}}{${2*m}!}\\)`, `\\(\\frac{x^{${2*m+1}}}{${2*m+1}!}\\)`, `\\(-\\frac{x^{${2*m+2}}}{${2*m+2}!}\\)`, `\\(-\\frac{x^{${2*m-1}}}{${2*m-1}!}\\)`]);
    prompt = `Después del término positivo \\(\\frac{x^{${2*m-1}}}{${2*m-1}!}\\) en la serie de \\(\\sin x\\), ¿cuál es el siguiente término omitido?`;
    hint = `En \\(\\sin x\\) aparecen potencias impares y los signos alternan: positivo, negativo, positivo, negativo...`;
    solution = `La serie de \\(\\sin x\\) alterna signos con potencias impares. Después de \\(\\frac{x^{${2*m-1}}}{${2*m-1}!}\\), el siguiente término tiene potencia \\(${2*m+1}\\) y signo negativo: ${answer}.`;
  } else if(t===4){
    answer = `\\(\\sum_{n=0}^{\\infty}(n+1)x^n\\)`;
    options = shuffledOptions([answer, `\\(\\sum_{n=0}^{\\infty}nx^n\\)`, `\\(\\sum_{n=1}^{\\infty}\\frac{x^n}{n}\\)`, `\\(\\sum_{n=0}^{\\infty}x^{n+1}\\)`, `\\(\\sum_{n=0}^{\\infty}(-1)^n x^n\\)`]);
    prompt = `Selecciona la serie que representa \\(\\frac{1}{(1-x)^2}\\), obtenida al derivar la serie geométrica.`;
    hint = `Deriva \\(1+x+x^2+x^3+\\cdots\\). Luego reindexa para que la suma empiece en \\(n=0\\).`;
    solution = `Derivando \\(\\sum_{n=0}^{\\infty}x^n\\) se obtiene \\(\\sum_{n=1}^{\\infty}n x^{n-1}\\). Reindexando, resulta ${answer}.`;
  } else if(t===5){
    answer = `Integrar término a término`;
    options = shuffledOptions([answer,'Derivar dos veces','Aplicar solamente el criterio de la razón','Sustituir x por 0','Usar integración por partes en cada término']);
    prompt = `Para obtener la serie de \\(\\ln(1+x)\\) a partir de \\(\\frac{1}{1+x}=\\sum_{n=0}^{\\infty}(-1)^n x^n\\), ¿qué procedimiento es el adecuado?`;
    hint = `Compara la función objetivo con la derivada conocida: \\(\\frac{d}{dx}\\ln(1+x)=\\frac{1}{1+x}\\).`;
    solution = `El procedimiento correcto es integrar término a término desde \\(0\\) hasta \\(x\\). Así se obtiene \\(\\ln(1+x)=\\sum_{n=1}^{\\infty}(-1)^{n+1}\\frac{x^n}{n}\\).`;
  } else if(t===6){
    const k = 2 + valueFrom(i,17,5);
    answer = `\\(\\frac{1}{1-${k}x}=\\sum_{n=0}^{\\infty}(${k}x)^n\\)`;
    options = shuffledOptions([answer, `\\(\\frac{1}{1-${k}x}=\\sum_{n=0}^{\\infty}\\frac{x^n}{${k}^n}\\)`, `\\(\\frac{1}{1-${k}x}=\\sum_{n=1}^{\\infty}n(${k}x)^n\\)`, `\\(\\frac{1}{1-${k}x}=\\sum_{n=0}^{\\infty}(-${k}x)^n\\)`, `\\(\\frac{1}{1-${k}x}=1-${k}x+${k*k}x^2-\\cdots\\)`]);
    prompt = `Selecciona la expansión geométrica correcta de \\(\\frac{1}{1-${k}x}\\).`;
    hint = `Usa la forma \\(\\frac{1}{1-r}=\\sum r^n\\). Aquí debes identificar \\(r\\) sin cambiar el signo.`;
    solution = `Aquí \\(r=${k}x\\). Por tanto, la expansión correcta es ${answer}, válida cuando \\(|${k}x|<1\\).`;
  } else {
    answer = `Revisar los extremos por separado`;
    options = shuffledOptions([answer,'Incluir siempre los dos extremos','Excluir siempre los dos extremos','Cambiar el centro de la serie','Eliminar el término general']);
    prompt = `Después de hallar el radio de convergencia de una serie de potencias, ¿qué debe hacerse para decidir el intervalo final?`;
    hint = `El radio solo da el intervalo abierto. Los extremos pueden converger o divergir según la serie que quede al sustituirlos.`;
    solution = `Después del radio, se sustituyen los dos extremos por separado. Solo así se decide si se incluyen o se excluyen en el intervalo de convergencia.`;
  }
  return {id:questionId('ch',i,`${t}-${diff}`), difficulty:diff, type:'choice', topic, title, prompt, options, answer, hint, solution};
}

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){const j=randInt(i+1);[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function ellipseMetrics(margin=0){
  const cx=(COLS-1)/2, cy=(ROWS-1)/2;
  const rx=(COLS-3)/2 - margin, ry=(ROWS-3)/2 - margin;
  return {cx,cy,rx,ry};
}
function ellipseCoords(x,y,margin=0){
  const {cx,cy,rx,ry}=ellipseMetrics(margin);
  const nx=(x-cx)/rx, ny=(y-cy)/ry;
  return {nx,ny,r:Math.hypot(nx,ny),a:Math.atan2(ny,nx)};
}
function insideEllipse(x,y,margin=0){
  return ellipseCoords(x,y,margin).r <= 1;
}
function angleDistance(a,b){
  let d=Math.abs(a-b)%(Math.PI*2);
  return d>Math.PI ? Math.PI*2-d : d;
}
function isPathChar(ch){ return ch === '.' || ch === 'S' || ch === 'E'; }
function isWallCell(x,y){
  if(x<0||y<0||x>=COLS||y>=ROWS) return true;
  return state.grid[y]?.[x] === '#';
}
function isFreeAt(x,y){
  const pts = [[x,y],[x-PLAYER_RADIUS,y],[x+PLAYER_RADIUS,y],[x,y-PLAYER_RADIUS],[x,y+PLAYER_RADIUS],[x-PLAYER_RADIUS*.72,y-PLAYER_RADIUS*.72],[x+PLAYER_RADIUS*.72,y+PLAYER_RADIUS*.72],[x-PLAYER_RADIUS*.72,y+PLAYER_RADIUS*.72],[x+PLAYER_RADIUS*.72,y-PLAYER_RADIUS*.72]];
  return pts.every(([px,py]) => !isWallCell(Math.floor(px), Math.floor(py)));
}
function pathCells(){
  const cells=[];
  for(let y=1;y<ROWS-1;y++) for(let x=1;x<COLS-1;x++){
    if(isPathChar(state.grid[y][x])) cells.push({x,y});
  }
  return cells;
}
function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
function distanceToExitCell(c){ return dist(c,state.exit); }
function difficultyAtPlayer(){
  const d = dist(state.player, {x:state.exit.x+.5,y:state.exit.y+.5});
  const maxD = Math.hypot(COLS/2, ROWS/2);
  const progress = 1 - clamp(d/maxD,0,1);
  if(progress > .78) return 'experto';
  if(progress > .55) return 'avanzado';
  if(progress > .32) return 'medio';
  return 'basico';
}
function difficultyLabel(d){return ({basico:'Básico',medio:'Medio',avanzado:'Avanzado',experto:'Experto',bono:'Bono'})[d] || d;}

function generateMaze(options={}){
  const grid = Array.from({length:ROWS},()=>Array.from({length:COLS},()=> '#'));
  let start = {x:1,y:ROWS-2};
  const exit = options.randomExit ? randomExitCell() : {x:Math.floor(COLS/2), y:Math.floor(ROWS/2)};

  // Laberinto rectangular tipo templo: se genera con DFS sobre celdas impares.
  // Esto garantiza un camino conectado y visible, con corredores amplios en toda la pantalla.
  const stack = [{x:1,y:1}];
  grid[1][1] = '.';
  const dirs = [{x:2,y:0},{x:-2,y:0},{x:0,y:2},{x:0,y:-2}];
  while(stack.length){
    const cur = stack[stack.length-1];
    const choices = shuffle(dirs).map(d=>({x:cur.x+d.x,y:cur.y+d.y,dx:d.x,dy:d.y}))
      .filter(n => n.x>0 && n.y>0 && n.x<COLS-1 && n.y<ROWS-1 && grid[n.y][n.x]==='#');
    if(!choices.length){ stack.pop(); continue; }
    const n = choices[0];
    grid[cur.y+n.dy/2][cur.x+n.dx/2] = '.';
    grid[n.y][n.x] = '.';
    stack.push({x:n.x,y:n.y});
  }

  // Abrir algunos muros internos para que el recorrido sea menos rígido y más jugable.
  for(let y=2;y<ROWS-2;y++){
    for(let x=2;x<COLS-2;x++){
      if(grid[y][x] !== '#') continue;
      const horizontal = grid[y][x-1] === '.' && grid[y][x+1] === '.';
      const vertical = grid[y-1][x] === '.' && grid[y+1][x] === '.';
      if((horizontal || vertical) && Math.random() < (options.randomExit ? 0.16 : 0.10)) grid[y][x] = '.';
    }
  }

  // Cámara central de salida, visible y conectada al laberinto.
  for(let yy=exit.y-1; yy<=exit.y+1; yy++){
    for(let xx=exit.x-1; xx<=exit.x+1; xx++){
      if(xx>0 && yy>0 && xx<COLS-1 && yy<ROWS-1) grid[yy][xx]='.';
    }
  }
  // Conectores de la cámara central hacia el camino cercano.
  for(let x=exit.x-3; x<=exit.x+3; x++) if(x>0 && x<COLS-1) grid[exit.y][x]='.';
  for(let y=exit.y-3; y<=exit.y+3; y++) if(y>0 && y<ROWS-1) grid[y][exit.x]='.';

  // Cámara de entrada inferior izquierda.
  for(let yy=start.y-1; yy<=start.y; yy++){
    for(let xx=start.x; xx<=start.x+2; xx++){
      if(xx>0 && yy>0 && xx<COLS-1 && yy<ROWS-1) grid[yy][xx]='.';
    }
  }

  // Cámaras laterales para tesoros y portales.
  const rooms = [
    {x:7,y:5,w:5,h:3},{x:COLS-12,y:5,w:5,h:3},
    {x:8,y:ROWS-8,w:5,h:3},{x:COLS-13,y:ROWS-8,w:5,h:3},
    {x:Math.floor(COLS/2)-3,y:4,w:7,h:3},{x:Math.floor(COLS/2)-3,y:ROWS-7,w:7,h:3}
  ];
  for(const r of rooms){
    for(let yy=r.y; yy<r.y+r.h; yy++) for(let xx=r.x; xx<r.x+r.w; xx++){
      if(xx>0 && yy>0 && xx<COLS-1 && yy<ROWS-1) grid[yy][xx]='.';
    }
  }

  if(options.farthestStart){
    start = farthestPathFrom(grid, exit);
  }

  grid[start.y][start.x]='S';
  grid[exit.y][exit.x]='E';
  state.grid = grid;
  state.start = start;
  state.exit = exit;
  state.player = {x:start.x+.5,y:start.y+.5};
  configureExitAccessZone();
  state.visitedCell = keyOf(start.x,start.y);
}

function nearestPathTo(grid,target){
  let best=null, bestD=Infinity;
  for(let y=1;y<ROWS-1;y++) for(let x=1;x<COLS-1;x++){
    if(isPathChar(grid[y][x])){
      const d=Math.hypot(x-target.x,y-target.y);
      if(d<bestD){bestD=d; best={x,y};}
    }
  }
  return best || {x:2,y:Math.floor(ROWS/2)};
}
function findOddStart(){
  return state.start || {x:2,y:Math.floor(ROWS/2)};
}
function farthestPathFrom(grid, ref){
  let best=null, bestD=-1;
  for(let y=1;y<ROWS-1;y++){
    for(let x=1;x<COLS-1;x++){
      if(isPathChar(grid[y][x])){
        const d = Math.hypot(x-ref.x, y-ref.y);
        if(d > bestD){ bestD = d; best = {x,y}; }
      }
    }
  }
  return best || {x:1,y:ROWS-2};
}
function randomExitCell(){
  const xChoices = [];
  const yChoices = [];
  for(let x=3; x<COLS-3; x+=2) xChoices.push(x);
  for(let y=3; y<ROWS-3; y+=2) yChoices.push(y);
  return {x:xChoices[randInt(xChoices.length)], y:yChoices[randInt(yChoices.length)]};
}

function chooseExitAccessDirection(){
  const dirs = [
    {x:1,y:0,name:'derecha'}, {x:-1,y:0,name:'izquierda'},
    {x:0,y:1,name:'abajo'}, {x:0,y:-1,name:'arriba'}
  ];
  return dirs
    .filter(d => {
      const x = state.exit.x + d.x * EXIT_ACCESS_CORRIDOR_LENGTH;
      const y = state.exit.y + d.y * EXIT_ACCESS_CORRIDOR_LENGTH;
      return x > 0 && y > 0 && x < COLS - 1 && y < ROWS - 1;
    })
    .sort((a,b) => {
      const da = Math.hypot(state.exit.x + a.x - state.start.x, state.exit.y + a.y - state.start.y);
      const db = Math.hypot(state.exit.x + b.x - state.start.x, state.exit.y + b.y - state.start.y);
      return da - db;
    })[0] || {x:1,y:0,name:'derecha'};
}

function configureExitAccessZone(){
  // Se construye una zona de salida con muchas casillas transportadoras,
  // pero se reserva exactamente una entrada segura cardinal hacia la casilla final.
  const dir = chooseExitAccessDirection();
  const safe = new Set();

  // Abrir una cámara alrededor de la salida para que las casillas transportadoras sean visibles.
  for(let dy=-EXIT_TRANSPORTER_RING_RADIUS; dy<=EXIT_TRANSPORTER_RING_RADIUS; dy++){
    for(let dx=-EXIT_TRANSPORTER_RING_RADIUS; dx<=EXIT_TRANSPORTER_RING_RADIUS; dx++){
      const x = state.exit.x + dx;
      const y = state.exit.y + dy;
      if(x>0 && y>0 && x<COLS-1 && y<ROWS-1 && Math.hypot(dx,dy) <= EXIT_TRANSPORTER_RING_RADIUS + .15){
        state.grid[y][x] = '.';
      }
    }
  }

  // Único corredor seguro: desde la dirección elegida hacia la salida.
  for(let i=1; i<=EXIT_ACCESS_CORRIDOR_LENGTH; i++){
    const x = state.exit.x + dir.x * i;
    const y = state.exit.y + dir.y * i;
    if(x>0 && y>0 && x<COLS-1 && y<ROWS-1){
      state.grid[y][x] = '.';
      safe.add(keyOf(x,y));
    }
  }

  // Tres guardianes matemáticos en el único camino seguro.
  // Se evita poner uno en la casilla inmediatamente pegada a la salida para no bloquear
  // visualmente la entrada final, y se conserva una celda de ingreso al corredor.
  const finalChallenges = new Set();
  const challengePositions = [2,3,4].filter(i => i <= EXIT_ACCESS_CORRIDOR_LENGTH);
  for(const i of challengePositions){
    const x = state.exit.x + dir.x * i;
    const y = state.exit.y + dir.y * i;
    if(x>0 && y>0 && x<COLS-1 && y<ROWS-1){
      finalChallenges.add(keyOf(x,y));
    }
  }

  // Marcar la celda adyacente segura. Cualquier otro acceso cardinal a la salida será transportador.
  state.exitSafeKeys = safe;
  state.finalChallengeCells = finalChallenges;
  state.exitAccessCell = {x: state.exit.x + dir.x, y: state.exit.y + dir.y, dir: dir.name};
  state.grid[state.exit.y][state.exit.x] = 'E';
}

function isExitSafeKey(k){
  return state.exitSafeKeys && state.exitSafeKeys.has(k);
}

function occupiedKeys(){
  const s = new Set([keyOf(state.start.x,state.start.y), keyOf(state.exit.x,state.exit.y), keyOf(Math.floor(state.player.x),Math.floor(state.player.y))]);
  state.treasures.filter(t=>!t.collected).forEach(t=>s.add(keyOf(t.x,t.y)));
  state.portals.forEach(p=>s.add(keyOf(p.x,p.y)));
  state.exitTransporters.forEach(t=>s.add(keyOf(t.x,t.y)));
  if(state.exitSafeKeys) state.exitSafeKeys.forEach(k=>s.add(k));
  if(state.finalChallengeCells) state.finalChallengeCells.forEach(k=>s.add(k));
  state.obstacles.forEach(k=>s.add(k));
  state.bonusCells.forEach(k=>s.add(k));
  state.trapCells.forEach(k=>s.add(k));
  return s;
}
function randomFreeCell({minExit=0,maxExit=999,avoid=null}={}){
  const occ = avoid || occupiedKeys();
  const candidates = pathCells().filter(c => {
    const k=keyOf(c.x,c.y);
    const d=distanceToExitCell(c);
    return !occ.has(k) && d>=minExit && d<=maxExit && isPathChar(state.grid[c.y][c.x]) && state.grid[c.y][c.x] !== 'E' && state.grid[c.y][c.x] !== 'S';
  });
  return candidates[randInt(candidates.length)] || state.start;
}
function placeTreasures(preserveCollected=new Set()){
  state.treasures = [];
  const occ = occupiedKeys();
  for(let i=0;i<TREASURE_TOTAL;i++){
    if(preserveCollected.has(i)){
      state.treasures.push({id:i, icon:TREASURE_ICONS[i], name:TREASURE_NAMES[i], x:-100-i, y:-100-i, collected:true});
      continue;
    }
    const min = 5 + i*2;
    const c = randomFreeCell({minExit:min, avoid:occ});
    occ.add(keyOf(c.x,c.y));
    state.treasures.push({id:i, icon:TREASURE_ICONS[i], name:TREASURE_NAMES[i], x:c.x, y:c.y, collected:false});
  }
}
function relocateTreasure(treasure){
  const occ = occupiedKeys();
  occ.delete(keyOf(treasure.x,treasure.y));
  const c = randomFreeCell({minExit:4, avoid:occ});
  treasure.x = c.x; treasure.y = c.y;
}
function relocateUncollectedTreasures(exceptCollected=true){
  for(const t of state.treasures){
    if(!t.collected || !exceptCollected) relocateTreasure(t);
  }
}
function nearestFreeAround(cell, occ, minR=2, maxR=5){
  const choices=[];
  for(let r=minR;r<=maxR;r++){
    for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
      if(Math.abs(dx)+Math.abs(dy)!==r) continue;
      const x=cell.x+dx,y=cell.y+dy,k=keyOf(x,y);
      if(x>0&&y>0&&x<COLS-1&&y<ROWS-1 && state.grid[y][x] !== '#' && !occ.has(k)) choices.push({x,y});
    }
    if(choices.length) return choices[randInt(choices.length)];
  }
  return null;
}
function placePortals(){
  state.portals = [];
  const occ = occupiedKeys();
  // Los portales normales acompañan a los tesoros, pero nunca se ubican cerca de la salida final.
  const bases = state.treasures.filter(t=>!t.collected && distanceToExitCell(t) >= EXIT_PORTAL_EXCLUSION_RADIUS + 2).map(t=>({x:t.x,y:t.y}));
  let id=0;
  for(const base of bases){
    const p = nearestFreeAround(base, occ, 2, 7);
    if(p && distanceToExitCell(p) >= EXIT_PORTAL_EXCLUSION_RADIUS){
      occ.add(keyOf(p.x,p.y)); state.portals.push({id:id++,x:p.x,y:p.y});
    }
  }
  while(state.portals.length < PORTAL_TOTAL){
    const c=randomFreeCell({minExit:EXIT_PORTAL_EXCLUSION_RADIUS, avoid:occ});
    occ.add(keyOf(c.x,c.y)); state.portals.push({id:id++,x:c.x,y:c.y});
  }
}
function placeExitTransporters(){
  state.exitTransporters = [];
  const occ = occupiedKeys();
  let id = 0;
  const choices=[];

  // Primera prioridad: todas las celdas cardinales y cercanas a la salida,
  // excepto la única celda de acceso seguro. Así solo queda un camino real
  // para entrar a la salida sin activar transporte.
  for(let r=1; r<=EXIT_TRANSPORTER_RING_RADIUS; r++){
    for(let dy=-r; dy<=r; dy++){
      for(let dx=-r; dx<=r; dx++){
        const manhattan = Math.abs(dx)+Math.abs(dy);
        const cheb = Math.max(Math.abs(dx), Math.abs(dy));
        if(cheb !== r) continue;
        const x = state.exit.x + dx;
        const y = state.exit.y + dy;
        const k = keyOf(x,y);
        if(x<=0 || y<=0 || x>=COLS-1 || y>=ROWS-1) continue;
        if(k === keyOf(state.exit.x,state.exit.y)) continue;
        if(isExitSafeKey(k)) continue;
        if(!isPathChar(state.grid[y][x])) continue;
        if(occ.has(k)) continue;
        // Se privilegian las casillas cardinales de radio 1 y luego el anillo externo.
        const priority = (manhattan === 1 ? 0 : r) + Math.random()*.05;
        choices.push({x,y,priority});
      }
    }
  }

  choices.sort((a,b)=>a.priority-b.priority);
  for(const c of choices){
    if(state.exitTransporters.length >= EXIT_TRANSPORTER_TOTAL) break;
    const k = keyOf(c.x,c.y);
    if(occ.has(k) || isExitSafeKey(k)) continue;
    occ.add(k);
    state.exitTransporters.push({id:id++,x:c.x,y:c.y,final:true});
  }

  // Respaldo: si por alguna regeneración faltan transportadores, ponerlos lejos del corredor seguro,
  // pero todavía relativamente cerca de la salida.
  while(state.exitTransporters.length < EXIT_TRANSPORTER_TOTAL){
    const c = randomFreeCell({minExit:2, maxExit:EXIT_TRANSPORTER_RING_RADIUS+3, avoid:occ});
    const k = keyOf(c.x,c.y);
    if(isExitSafeKey(k) || k === keyOf(state.exit.x,state.exit.y)) break;
    occ.add(k);
    state.exitTransporters.push({id:id++,x:c.x,y:c.y,final:true});
  }
}

function placeObstaclesAndBonus(){
  state.obstacles.clear();
  state.bonusCells.clear();
  let occ = occupiedKeys();
  const all = shuffle(pathCells().filter(c => !occ.has(keyOf(c.x,c.y)) && distanceToExitCell(c)>3));
  let obs=0;
  for(const c of all){
    if(obs>=OBSTACLE_TOTAL) break;
    const nearExit = distanceToExitCell(c)<9;
    if(nearExit || Math.random()<0.55){
      const k=keyOf(c.x,c.y);
      state.obstacles.add(k);
      occ.add(k);
      obs++;
    }
  }
  const allBonus = shuffle(pathCells().filter(c => !occ.has(keyOf(c.x,c.y)) && distanceToExitCell(c)>4));
  for(let i=0;i<8 && i<allBonus.length;i++){
    const k=keyOf(allBonus[i].x,allBonus[i].y);
    state.bonusCells.add(k);
    occ.add(k);
  }
}

function placeTrapButtons(){
  state.trapCells.clear();
  let occ = occupiedKeys();
  const cells = shuffle(pathCells().filter(c => {
    const k = keyOf(c.x,c.y);
    const nearExit = distanceToExitCell(c) < 2.4;
    const nearStart = dist(c,state.start) < 2.6;
    return !occ.has(k) && !nearExit && !nearStart && state.grid[c.y][c.x] !== 'E' && state.grid[c.y][c.x] !== 'S';
  }));
  for(const c of cells){
    if(state.trapCells.size >= TRAP_TOTAL) break;
    const k = keyOf(c.x,c.y);
    state.trapCells.add(k);
    occ.add(k);
  }
}
function rebuildLabyrinthAfterTreasureFailure(treasure){
  const collectedIds = new Set(state.treasures.filter(t=>t.collected).map(t=>t.id));
  state.obstacles = new Set();
  state.bonusCells = new Set();
  state.trapCells = new Set();
  state.portals = [];
  state.exitTransporters = [];
  state.exitSafeKeys = new Set();
  state.finalChallengeCells = new Set();
  state.exitAccessCell = null;
  generateMaze({randomExit:true, farthestStart:true});
  placeTreasures(collectedIds);
  placePortals();
  placeExitTransporters();
  placeObstaclesAndBonus();
  placeTrapButtons();
  state.lastQuestionStep = state.steps;
  state.visitedCell = keyOf(Math.floor(state.player.x), Math.floor(state.player.y));
  addEvent(`El reto del tesoro ${treasure.name} fue fallado: el laberinto cambió completamente, la salida se movió y la ficha fue enviada al extremo opuesto.`, 'bad');
  resizeCanvas();
  updateHUD();
}
function rebuildLabyrinthByTrapButton(){
  const collectedIds = new Set(state.treasures.filter(t=>t.collected).map(t=>t.id));
  state.obstacles = new Set();
  state.bonusCells = new Set();
  state.trapCells = new Set();
  state.portals = [];
  state.exitTransporters = [];
  state.exitSafeKeys = new Set();
  state.finalChallengeCells = new Set();
  state.exitAccessCell = null;
  generateMaze({randomExit:true, farthestStart:true});
  placeTreasures(collectedIds);
  placePortals();
  placeExitTransporters();
  placeObstaclesAndBonus();
  placeTrapButtons();
  state.lastQuestionStep = state.steps;
  state.visitedCell = keyOf(Math.floor(state.player.x), Math.floor(state.player.y));
  addEvent('Botón trampa activado: el laberinto cambió completamente de forma y la ficha fue enviada lejos de la nueva salida.', 'trap');
  resizeCanvas();
  updateHUD();
}

function rebuildLabyrinthAfterFinalChallengeFailure(){
  const collectedIds = new Set(state.treasures.filter(t=>t.collected).map(t=>t.id));
  state.obstacles = new Set();
  state.bonusCells = new Set();
  state.trapCells = new Set();
  state.portals = [];
  state.exitTransporters = [];
  state.exitSafeKeys = new Set();
  state.finalChallengeCells = new Set();
  state.exitAccessCell = null;
  generateMaze({randomExit:true, farthestStart:true});
  placeTreasures(collectedIds);
  placePortals();
  placeExitTransporters();
  placeObstaclesAndBonus();
  placeTrapButtons();
  state.lastQuestionStep = state.steps;
  state.visitedCell = keyOf(Math.floor(state.player.x), Math.floor(state.player.y));
  addEvent('Guardián final fallado: perdiste 1.0 unidad, el laberinto cambió completamente y el animal apareció lo más lejos posible de la nueva salida.', 'bad');
  resizeCanvas();
  updateHUD();
}


function resetGame(){
  state.score=1.0; state.steps=0; state.lastQuestionStep=0; state.treasuresFound=0;
  state.answered=[]; state.log=[]; state.startedAt=new Date(); state.finishedAt=null;
  state.security = { locks:0, fullscreenExits:0, focusLosses:0, hiddenTabs:0, escapeKey:0, rightClicks:0, printScreen:0, blockedShortcuts:0, wrongTeacherCodes:0 };
  state.cancelled = false; securityLockActive = false; lastSecurityEventAt = 0;
  state.obstacles = new Set(); state.bonusCells = new Set(); state.trapCells = new Set(); state.portals=[]; state.exitTransporters=[]; state.exitSafeKeys = new Set(); state.finalChallengeCells = new Set(); state.exitAccessCell = null;
  generateMaze();
  placeTreasures();
  placePortals();
  placeExitTransporters();
  placeObstaclesAndBonus();
  placeTrapButtons();
  updateHUD();
  hud.log.innerHTML='';
  addEvent('La expedición comenzó. Encuentra 4 tesoros y luego entra a la salida central. La hora del dispositivo permanecerá visible durante toda la partida.', 'good');
  gameRunning=true; modalOpen=false;
}

function resizeCanvas(){
  const panel = canvas.parentElement;
  const rect = panel.getBoundingClientRect();
  const w = Math.max(320, Math.floor(rect.width));
  const h = Math.max(240, Math.floor(rect.height));
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr,0,0,dpr,0,0);

  // El tablero rectangular usa la mayor casilla posible y siempre cabe completo.
  const padX = Math.max(10, Math.floor(w * 0.012));
  const padY = Math.max(10, Math.floor(h * 0.012));
  tile = Math.max(10, Math.floor(Math.min((w - 2*padX) / COLS, (h - 2*padY) / ROWS)));
  offsetX = Math.floor((w - tile * COLS) / 2);
  offsetY = Math.floor((h - tile * ROWS) / 2);
}
window.addEventListener('resize', resizeCanvas);

function draw(){
  const w = canvas.clientWidth, h=canvas.clientHeight;
  ctx.clearRect(0,0,w,h);
  drawPyramidBackground(w,h);
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,.18)';
  ctx.fillRect(offsetX-6,offsetY-6,tile*COLS+12,tile*ROWS+12);
  ctx.fillStyle='#c7832f';
  ctx.fillRect(offsetX,offsetY,tile*COLS,tile*ROWS);
  for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){
    const ch=state.grid[y]?.[x];
    if(ch === '#') drawWall(x,y);
    else if(ch === '.' || ch === 'S' || ch === 'E') drawFloor(x,y);
  }
  for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){
    if(state.grid[y]?.[x] !== '#') drawPathDot(x,y);
  }
  drawSpecials();
  drawPlayer();
  ctx.restore();
  drawOuterFrame();
}
function drawPyramidBackground(w,h){
  const g=ctx.createLinearGradient(0,0,0,h);
  g.addColorStop(0,'#0c2c55');g.addColorStop(.55,'#081a33');g.addColorStop(1,'#030813');
  ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  ctx.save();
  ctx.globalAlpha=.22;
  ctx.strokeStyle='#ffd35a';ctx.lineWidth=2;
  for(let i=-w;i<w*2;i+=72){ctx.beginPath();ctx.moveTo(i,h);ctx.lineTo(i+w*.35,0);ctx.stroke();}
  ctx.globalAlpha=.12;ctx.font='22px Georgia';ctx.fillStyle='#ffe39a';
  for(let y=40;y<h;y+=70){for(let x=30;x<w;x+=180){ctx.fillText('𓂀 𓃭 𓆣',x,y);}}
  ctx.restore();
}
function drawFloor(x,y){
  const px=offsetX+x*tile, py=offsetY+y*tile;
  const grd=ctx.createLinearGradient(px,py,px,py+tile);
  grd.addColorStop(0,((x+y)%2===0)?'#f3c363':'#e7ad45');
  grd.addColorStop(1,((x+y)%2===0)?'#c98227':'#bb741f');
  ctx.fillStyle=grd;ctx.fillRect(px,py,tile,tile);
  ctx.strokeStyle='rgba(93,48,8,.24)';ctx.lineWidth=Math.max(1,tile*.035);ctx.strokeRect(px+.5,py+.5,tile-1,tile-1);
}
function drawPathDot(x,y){
  const px=offsetX+(x+.5)*tile, py=offsetY+(y+.5)*tile;
  if((x+y)%6===0){
    ctx.fillStyle='rgba(255,249,210,.28)';
    ctx.beginPath();ctx.arc(px,py,Math.max(1.4,tile*.055),0,Math.PI*2);ctx.fill();
  }
}
function drawWall(x,y){
  const px=offsetX+x*tile, py=offsetY+y*tile;
  const grd=ctx.createLinearGradient(px,py,px+tile,py+tile);
  grd.addColorStop(0,'#075c91');grd.addColorStop(.48,'#0c74ad');grd.addColorStop(1,'#03406f');
  ctx.fillStyle=grd;ctx.fillRect(px,py,tile,tile);
  ctx.strokeStyle='rgba(255,219,103,.55)';ctx.lineWidth=Math.max(1,tile*.045);ctx.strokeRect(px+1,py+1,tile-2,tile-2);
  if(tile >= 24 && (x+y)%7===0){
    ctx.fillStyle='rgba(255,232,154,.32)';ctx.font=`${Math.max(8,tile*.32)}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('𓂀',px+tile/2,py+tile*.55);
  }
}
function drawSpecials(){
  // salida central
  const exitOpen = state.treasuresFound >= TREASURE_TOTAL;
  drawIconCell(state.exit.x,state.exit.y, exitOpen?'𓂀':'🔒', exitOpen?'#00d5c8':'#493219', exitOpen?'#001b26':'#ffd35a');
  state.exitTransporters.forEach(t=>drawIconCell(t.x,t.y,EXIT_TRANSPORTER_ICON,'#00a6a6','#fff3ce',true));
  if(state.finalChallengeCells){ state.finalChallengeCells.forEach(k=>{ const [x,y]=k.split(',').map(Number); drawIconCell(x,y,FINAL_CHALLENGE_ICON,'#4b0f7a','#ffe38a',true); }); }
  state.portals.forEach(p=>drawIconCell(p.x,p.y,PORTAL_ICON,'#6436e8','#fff'));
  let obstacleIndex = 0;
  state.obstacles.forEach(k=>{const [x,y]=k.split(',').map(Number); drawIconCell(x,y,OBSTACLE_ICONS[obstacleIndex++ % OBSTACLE_ICONS.length],'#7b250d','#ffd35a');});
  state.bonusCells.forEach(k=>{const [x,y]=k.split(',').map(Number); drawIconCell(x,y,BONUS_ICON,'#01594f','#bfffee');});
  state.trapCells.forEach(k=>{const [x,y]=k.split(',').map(Number); drawIconCell(x,y,TRAP_ICON,'#a60d1a','#fff3ce',true);});
  state.treasures.filter(t=>!t.collected).forEach(t=>drawIconCell(t.x,t.y,t.icon,'#ffd35a','#3a1600',true));
}
function drawIconCell(x,y,icon,bg,fg,glow=false){
  const px=offsetX+x*tile, py=offsetY+y*tile;
  ctx.save();
  if(glow){ctx.shadowColor='#ffe27a';ctx.shadowBlur=18;}
  ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(px+tile*.13,py+tile*.13,tile*.74,tile*.74,tile*.18);ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${Math.max(12,tile*.58)}px serif`;ctx.fillText(icon || '𓂀',px+tile/2,py+tile*.53);
  ctx.restore();
}
function drawPlayer(){
  const px=offsetX+state.player.x*tile, py=offsetY+state.player.y*tile;
  ctx.save();
  ctx.shadowColor='rgba(255,211,90,.85)';ctx.shadowBlur=14;
  ctx.fillStyle='#fff3ce';ctx.beginPath();ctx.arc(px,py,tile*.43,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${Math.max(18,tile*.75)}px serif`;ctx.fillText(selectedAnimal,px,py+tile*.02);
  ctx.restore();
}
function drawOuterFrame(){
  ctx.save();
  const x = offsetX, y = offsetY, w = tile*COLS, h = tile*ROWS;
  ctx.shadowColor='#00d5c8';ctx.shadowBlur=18;
  ctx.strokeStyle='#ffd35a';ctx.lineWidth=Math.max(4,tile*.20);
  ctx.strokeRect(x,y,w,h);
  ctx.shadowBlur=0;
  ctx.strokeStyle='rgba(255,243,206,.78)';ctx.lineWidth=Math.max(1,tile*.045);
  ctx.strokeRect(x+tile*.45,y+tile*.45,w-tile*.9,h-tile*.9);
  ctx.restore();
}

function gameLoop(now){
  const dt = Math.min(.05,(now-lastTime)/1000);
  lastTime=now;
  if(gameRunning && !modalOpen){ updatePlayer(dt); }
  draw();
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

function updatePlayer(dt){
  const dir = getActiveDir();
  currentDir = dir;
  if(dir.x===0 && dir.y===0) return;
  const speed = SPEED_CELLS_PER_SEC * dt;
  let nx = state.player.x + dir.x*speed;
  let ny = state.player.y + dir.y*speed;
  // colisión por ejes para deslizar suave
  if(isFreeAt(nx,state.player.y)) state.player.x = nx;
  if(isFreeAt(state.player.x,ny)) state.player.y = ny;
  const c = cellOf(state.player);
  const ck = keyOf(c.x,c.y);
  if(ck !== state.visitedCell){
    state.visitedCell=ck;
    state.steps++;
    handleCell(c);
    updateHUD();
  }
}
function getActiveDir(){
  // prioridad a la última tecla pulsada entre las que siguen presionadas
  const order = Array.from(keys).reverse();
  for(const k of order){ if(keyToDir[k]) return keyToDir[k]; }
  return {x:0,y:0};
}
function handleCell(c){
  const k=keyOf(c.x,c.y);
  const treasure = state.treasures.find(t=>!t.collected && t.x===c.x && t.y===c.y);
  if(treasure){ openQuestion('treasure', treasure); return; }
  const exitTransporter = state.exitTransporters.find(t=>t.x===c.x && t.y===c.y);
  if(exitTransporter){ teleportFromExitTransporter(exitTransporter); return; }
  const portal = state.portals.find(p=>p.x===c.x && p.y===c.y);
  if(portal){ teleportFrom(portal); return; }
  if(state.obstacles.has(k)){ openQuestion('obstacle', {key:k}); return; }
  if(state.bonusCells.has(k)){ openQuestion('bonus', {key:k}); return; }
  if(state.trapCells.has(k)){ rebuildLabyrinthByTrapButton(); return; }
  if(state.finalChallengeCells && state.finalChallengeCells.has(k)){ openQuestion('finalChallenge', {key:k}); return; }
  if(c.x===state.exit.x && c.y===state.exit.y){
    if(state.treasuresFound >= TREASURE_TOTAL){ state.score = MAX_SCORE; updateHUD(); finishGame('Has encontrado los cuatro tesoros y llegaste a la salida central. Nota final: 5.0.'); }
    else { addEvent(`La cámara de salida está cerrada. Faltan ${TREASURE_TOTAL-state.treasuresFound} tesoros.`, 'bad'); }
    return;
  }
  if(state.steps>0 && state.steps % QUESTION_STEP_INTERVAL === 0 && state.lastQuestionStep !== state.steps){
    state.lastQuestionStep = state.steps;
    openQuestion('regular', {});
  }
}
function teleportFromExitTransporter(transporter){
  // Los transportadores alrededor de la salida castigan accesos equivocados:
  // envían a una cámara lejana de la salida, no a otro portal cercano.
  const candidates = pathCells().filter(c => {
    const k = keyOf(c.x,c.y);
    return distanceToExitCell(c) >= Math.max(12, Math.floor(COLS/3))
      && !state.trapCells.has(k)
      && !state.obstacles.has(k)
      && !state.bonusCells.has(k)
      && !state.treasures.some(t => !t.collected && t.x===c.x && t.y===c.y)
      && !state.portals.some(p => p.x===c.x && p.y===c.y);
  });
  const target = candidates[randInt(candidates.length)] || state.start;
  addEvent('Transportador final activado: el animal fue enviado lejos de la salida. Busca el único corredor seguro para entrar.', 'portal');
  state.player.x = target.x + .5;
  state.player.y = target.y + .5;
  state.visitedCell = keyOf(target.x,target.y);
}

function teleportFrom(portal){
  if(state.portals.length<2) return;
  const others = state.portals.filter(p=>p.id!==portal.id);
  const target = others[randInt(others.length)];
  addEvent(`Portal activado: el animal fue transportado a otra cámara del laberinto.`, 'portal');
  state.player.x = target.x+.5; state.player.y=target.y+.5; state.visitedCell=keyOf(target.x,target.y);
}

function openQuestion(kind, data){
  modalOpen = true;
  let difficulty = kind==='bonus' ? 'bono' : difficultyAtPlayer();
  if(kind==='treasure') difficulty = 'experto';
  if(kind==='finalChallenge') difficulty = 'avanzado';
  if(kind==='obstacle' && difficulty==='basico') difficulty='medio';
  const q = chooseQuestion(difficulty, kind);
  activeQuestion = {kind, data, q};
  currentAnswerResult = null; pendingAfterQuestion = null;
  questionBadge.textContent = difficultyLabel(q.difficulty === 'bono' ? 'bono' : difficulty);
  questionTitle.textContent = buildQuestionTitle(kind, q);
  questionText.innerHTML = `<div class="topic"><strong>Tema:</strong> ${q.topic}</div><div class="latex-panel">${q.prompt}</div>`;
  if(kind === 'treasure'){
    hintBtn.classList.add('hidden');
    hintText.innerHTML = `<strong>Reto de tesoro:</strong><div class="latex-panel small-latex">Este reto no tiene pista. Debe resolverse con el procedimiento matemático completo.</div>`;
  } else if(kind === 'finalChallenge'){
    hintBtn.classList.add('hidden');
    hintText.innerHTML = `<strong>Guardián final:</strong><div class="latex-panel small-latex">Este reto avanzado no tiene pista. Si fallas, perderás \(1.0\) unidad y el laberinto cambiará completamente.</div>`;
  } else {
    hintBtn.classList.remove('hidden');
    hintText.innerHTML = `<strong>Pista orientadora:</strong><div class="latex-panel small-latex">${q.hint}</div>`;
  }
  hintText.classList.add('hidden');
  feedbackBox.className='feedback hidden math-book'; feedbackBox.innerHTML='';
  submitAnswerBtn.classList.remove('hidden'); continueBtn.classList.add('hidden');
  renderAnswerForm(q);
  questionModal.classList.remove('hidden');
  typesetMath();
}
function buildQuestionTitle(kind,q){
  if(kind==='treasure') return `Reto del tesoro: ${activeQuestion?.data?.name || 'tesoro'}`;
  if(kind==='finalChallenge') return 'Guardián final del corredor seguro';
  if(kind==='obstacle') return 'Obstáculo egipcio';
  if(kind==='bonus') return q.title;
  return q.title;
}
function chooseQuestion(difficulty, kind){
  const targetDifficulty = kind === 'bonus' ? 'bono' : (kind === 'treasure' ? 'experto' : (kind === 'finalChallenge' ? 'avanzado' : difficulty));
  const used = new Set(state.answered.slice(-120).map(a=>a.id));
  const types = (kind === 'treasure' || kind === 'finalChallenge') ? ['statements','integer','choice'] : (questionBank.types || ['tf','statements','integer','choice']);

  // Muestreo pseudoaleatorio sin preconstruir el banco completo.
  // Se prueban varios índices hasta encontrar una pregunta con la dificultad pedida
  // y que no haya aparecido recientemente.
  for(let attempt=0; attempt<220; attempt++){
    const type = types[randInt(types.length)];
    const i = randInt(QUESTIONS_PER_TYPE);
    const q = makeGeneratedQuestion(type, i);
    if(q.difficulty === targetDifficulty && !used.has(q.id)) return q;
  }

  // Respaldo determinístico: garantiza que siempre haya pregunta disponible
  // aunque el azar no encuentre una coincidencia en los intentos anteriores.
  const fallbackStart = randInt(QUESTIONS_PER_TYPE);
  for(const type of shuffle(types.slice())){
    for(let step=0; step<QUESTIONS_PER_TYPE; step++){
      const i = (fallbackStart + step) % QUESTIONS_PER_TYPE;
      const q = makeGeneratedQuestion(type, i);
      if(q.difficulty === targetDifficulty && !used.has(q.id)) return q;
    }
  }

  // Último respaldo: una pregunta media, para evitar que el juego se bloquee.
  for(const type of types){
    for(let i=0; i<25; i++){
      const q = makeGeneratedQuestion(type, i);
      if(q.difficulty === 'medio') return q;
    }
  }
  return makeGeneratedQuestion('choice', 1);
}
function renderAnswerForm(q){
  answerForm.innerHTML='';
  if(q.type==='integer'){
    answerForm.innerHTML = `<label class="integer-answer"><span>Respuesta entera:</span><input id="integerInput" type="number" step="1" autocomplete="off" placeholder="Ejemplo: 3" /></label>`;
    setTimeout(()=>document.getElementById('integerInput')?.focus(),50);
    return;
  }
  q.options.forEach((op,i)=>{
    const id=`op_${i}`;
    const label=document.createElement('label');
    label.className='answer-option math-book';
    label.innerHTML=`<input type="radio" name="answer" value="${escapeAttr(op)}" id="${id}"><span class="option-text">${op}</span>`;
    answerForm.appendChild(label);
  });
}
function escapeAttr(s){ return String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
function getUserAnswer(q){
  if(q.type==='integer') return (document.getElementById('integerInput')?.value || '').trim();
  return answerForm.querySelector('input[name="answer"]:checked')?.value || '';
}
function submitAnswer(){
  if(!activeQuestion) return;
  const q = activeQuestion.q;
  const user = getUserAnswer(q);
  if(user===''){ alert('Selecciona o escribe una respuesta antes de continuar.'); return; }
  const correct = q.type==='integer' ? String(parseInt(user,10)) === String(q.answer) : user === q.answer;
  const delta = scoreDelta(activeQuestion.kind, correct);
  state.score = clamp(Number((state.score + delta).toFixed(2)), 0, MAX_SCORE);
  const feedbackKind = correct ? 'good' : 'bad';
  feedbackBox.className = `feedback ${feedbackKind} math-book`;
  feedbackBox.innerHTML = buildFeedback(q,user,correct,delta);
  submitAnswerBtn.classList.add('hidden'); continueBtn.classList.remove('hidden');
  state.answered.push({
    id:q.id, title:q.title, topic:q.topic, difficulty:q.difficulty, kind:activeQuestion.kind,
    user, correct, delta, solution:q.solution, prompt:q.prompt, answer:q.answer, hint:(activeQuestion.kind==='treasure' || activeQuestion.kind==='finalChallenge') ? '' : q.hint, type:q.type
  });
  prepareAfterQuestion(correct);
  updateHUD();
  typesetMath();
}
function scoreDelta(kind,correct){
  if(kind==='treasure') return correct ? 1.0 : -0.5;
  if(kind==='finalChallenge') return correct ? 0.2 : -1.0;
  if(kind==='bonus') return correct ? 0.3 : 0;
  return correct ? 0.2 : -0.1;
}
function buildFeedback(q,user,correct,delta){
  const ans = q.type==='integer' ? q.answer : q.answer;
  const change = `${delta>=0?'+':''}${delta.toFixed(1)}`;
  if(correct){
    return `<div class="feedback-title">Respuesta correcta · cambio en la nota: ${change}</div>
      <div class="solution-block latex-panel"><h3>Procedimiento matemático</h3><p>${q.solution}</p></div>`;
  }
  return `<div class="feedback-title">Respuesta incorrecta · cambio en la nota: ${change}</div>
    <p>Tu respuesta fue <em>${escapeHtml(user)}</em>, pero la respuesta correcta era <strong>${escapeHtml(ans)}</strong>.</p>
    <div class="solution-block latex-panel"><h3>Por qué era incorrecta y cómo debía hacerse</h3><p>${q.solution}</p></div>`;
}
function escapeHtml(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}
function prepareAfterQuestion(correct){
  const {kind,data} = activeQuestion;
  if(kind==='treasure'){
    pendingAfterQuestion = () => {
      if(correct){
        data.collected = true;
        state.treasuresFound++;
        addEvent(`Tesoro encontrado: ${data.name}. Ganaste +1.0 unidad.`, 'treasure');
      } else {
        rebuildLabyrinthAfterTreasureFailure(data);
        return;
      }
      relocateUncollectedTreasures(true);
      placePortals();
      updateHUD();
    };
  } else if(kind==='finalChallenge'){
    pendingAfterQuestion = () => {
      if(correct){
        state.finalChallengeCells.delete(data.key);
        addEvent('Guardián final superado: el corredor seguro queda abierto en esa casilla.', 'good');
      } else {
        rebuildLabyrinthAfterFinalChallengeFailure();
      }
      updateHUD();
    };
  } else if(kind==='obstacle'){
    pendingAfterQuestion = () => {
      state.obstacles.delete(data.key);
      addEvent(correct ? 'Superaste un obstáculo egipcio.' : 'El obstáculo quedó resuelto, pero la respuesta fue incorrecta.', correct?'good':'bad');
    };
  } else if(kind==='bonus'){
    pendingAfterQuestion = () => {
      state.bonusCells.delete(data.key);
      addEvent(correct ? 'Bono egipcio logrado: suma adicional.' : 'Bono egipcio fallado: no resta nota.', correct?'bonus':'bad');
    };
  } else {
    pendingAfterQuestion = () => addEvent(correct ? 'Pregunta regular correcta.' : 'Pregunta regular incorrecta.', correct?'good':'bad');
  }
}
function continueAfterQuestion(){
  questionModal.classList.add('hidden');
  if(pendingAfterQuestion) pendingAfterQuestion();
  activeQuestion=null; pendingAfterQuestion=null; modalOpen=false;
}
function typesetMath(){ if(window.MathJax?.typesetPromise) MathJax.typesetPromise().catch(()=>{}); }

function updateHUD(){
  updateDeviceClock();
  hud.score.textContent = state.score.toFixed(1);
  hud.treasure.textContent = `${state.treasuresFound}/${TREASURE_TOTAL}`;
  hud.steps.textContent = state.steps;
  const diff = difficultyAtPlayer();
  hud.difficulty.textContent = difficultyLabel(diff);
  const remaining = TREASURE_TOTAL-state.treasuresFound;
  hud.mission.textContent = remaining>0 ? `Faltan ${remaining} tesoro${remaining===1?'':'s'}. Encuéntralos antes de entrar a la salida central.` : 'Los cuatro tesoros han sido encontrados. La salida está abierta: entra por el único corredor seguro y supera sus tres guardianes avanzados; las otras casillas cercanas transportan lejos.';
}
function addEvent(text,type=''){
  state.log.unshift({time:new Date(),text,type});
  state.log = state.log.slice(0,60);
  renderLog();
}
function renderLog(){
  hud.log.innerHTML = state.log.slice(0,12).map(e=>`<div class="event ${e.type}"><strong>${e.time.toLocaleTimeString()}</strong><br>${escapeHtml(e.text)}</div>`).join('');
}

function finishGame(message='La expedición ha finalizado.'){
  gameRunning=false; modalOpen=true; state.finishedAt=new Date();
  endTitle.textContent = message;
  const correct = state.answered.filter(a=>a.correct).length;
  const total = state.answered.length;
  endSummary.innerHTML = `
    <p>Resultado de la expedición en el laberinto rectangular.</p>
    <table>
      <tr><th>Nota final</th><td>${state.score.toFixed(1)}</td></tr>
      <tr><th>Tesoros encontrados</th><td>${state.treasuresFound}/${TREASURE_TOTAL}</td></tr>
      <tr><th>Preguntas respondidas</th><td>${total}</td></tr>
      <tr><th>Aciertos</th><td>${correct}</td></tr>
      <tr><th>Pasos</th><td>${state.steps}</td></tr>
      <tr><th>Bloqueos de seguridad</th><td>${state.security?.locks || 0}/${MAX_SECURITY_LOCKS}</td></tr>
    </table>
    <p>El informe HTML incluye portada, resumen, gráficas de desempeño, fórmulas para repasar, plan de mejora, registro de eventos y detalle de cada pregunta con procedimiento matemático.</p>`;
  endModal.classList.remove('hidden');
  typesetMath();
}
function generateReport(){
  const finished = state.finishedAt || new Date();
  const total = state.answered.length;
  const correct = state.answered.filter(a=>a.correct).length;
  const incorrect = total - correct;
  const pct = total ? Math.round((correct/total)*100) : 0;
  const treasurePct = Math.round((state.treasuresFound/TREASURE_TOTAL)*100);
  const elapsedMs = Math.max(0, finished - (state.startedAt || finished));
  const elapsedMin = Math.floor(elapsedMs/60000);
  const elapsedSec = Math.floor((elapsedMs%60000)/1000);
  const resultLabel = state.cancelled ? 'Quiz anulado por eventos críticos de seguridad' : (state.treasuresFound >= TREASURE_TOTAL ? 'Expedición completada' : 'Expedición en progreso o finalizada manualmente');
  const score50 = Math.max(0, Math.min(50, Math.round(state.score*10)));

  const byTopic = {};
  const byType = {};
  const byDifficulty = {};
  const allTopics = ['Series de potencias','Radio de convergencia','Intervalo','Taylor','Maclaurin','Serie geométrica','Derivar series','Integrar series','Coeficientes','Aproximación','Bono egipcio','Extremos','Radio con factoriales','Taylor y error'];
  for(const topic of allTopics) byTopic[topic] = {ok:0,total:0};
  for(const a of state.answered){
    const topic = a.topic || 'Sin tema';
    if(!byTopic[topic]) byTopic[topic] = {ok:0,total:0};
    byTopic[topic].total++;
    if(a.correct) byTopic[topic].ok++;
    const typeName = questionTypeLabel(a.type);
    if(!byType[typeName]) byType[typeName] = {ok:0,total:0};
    byType[typeName].total++;
    if(a.correct) byType[typeName].ok++;
    const diffName = difficultyLabel(a.difficulty || 'basico');
    if(!byDifficulty[diffName]) byDifficulty[diffName] = {ok:0,total:0};
    byDifficulty[diffName].total++;
    if(a.correct) byDifficulty[diffName].ok++;
  }

  function statRows(obj){
    const entries = Object.entries(obj).filter(([_,v])=>v.total>0);
    if(!entries.length) return '<p class="muted">Aún no hay preguntas respondidas para graficar desempeño.</p>';
    return entries.map(([name,v])=>{
      const p = v.total ? Math.round((v.ok/v.total)*100) : 0;
      return `<div class="bar-row"><div class="bar-label"><strong>${escapeHtml(name)}</strong><span>${v.ok}/${v.total} · ${p}%</span></div><div class="bar-track"><div class="bar-fill" style="width:${p}%"></div></div></div>`;
    }).join('');
  }
  function formulaCards(){
    const cards = [
      {t:'Series de potencias', r:'Resultado central', f:'\\[\\sum_{n=0}^{\\infty}a_n(x-c)^n\\]', m:'Identificar centro, coeficientes y aplicar razón o raíz cuando corresponda.', e:'Olvidar que el intervalo final exige revisar extremos.'},
      {t:'Radio de convergencia', r:'Criterio de razón', f:'\\[R=\\frac{1}{\\lim_{n\\to\\infty}|a_{n+1}/a_n|}\\]', m:'Calcular primero el radio y después el intervalo.', e:'Confundir radio con intervalo.'},
      {t:'Serie geométrica', r:'Modelo base', f:'\\[\\frac{1}{1-r}=\\sum_{n=0}^{\\infty}r^n,\\quad |r|<1\\]', m:'Reescribir la función para reconocer el valor de r.', e:'Usar la fórmula fuera de |r|<1.'},
      {t:'Taylor y Maclaurin', r:'Polinomio de Taylor', f:'\\[P_n(x)=\\sum_{k=0}^{n}\\frac{f^{(k)}(a)}{k!}(x-a)^k\\]', m:'Calcular derivadas en el centro y conservar signos.', e:'Confundir Taylor en a con Maclaurin en 0.'},
      {t:'Derivar e integrar series', r:'Operación término a término', f:'\\[\\left(\\sum a_nx^n\\right)^{\\prime}=\\sum na_nx^{n-1}\\]', m:'Mantener el mismo radio de convergencia y revisar extremos aparte.', e:'No reindexar correctamente.'}
    ];
    return cards.map(c=>`<article class="formula-card"><h3>${c.t}</h3><p><strong>${c.r}:</strong></p><div class="formula">${c.f}</div><p><strong>Método recomendado:</strong> ${c.m}</p><p><strong>Error frecuente:</strong> ${c.e}</p></article>`).join('');
  }
  function improvementPlan(){
    const weak = Object.entries(byTopic).filter(([_,v])=>v.total>0).sort((a,b)=>((a[1].ok/a[1].total)-(b[1].ok/b[1].total))).slice(0,4);
    if(!weak.length) return '<p class="muted">No hay suficientes respuestas para construir un plan de mejora individual.</p>';
    return `<ol>${weak.map(([name,v])=>{
      const p = Math.round((v.ok/v.total)*100);
      return `<li><strong>${escapeHtml(name)}:</strong> ${v.ok}/${v.total} · ${p}%. Revisar definición, fórmula central, procedimiento de sustitución y verificación de extremos o coeficientes según corresponda.</li>`;
    }).join('')}</ol>`;
  }
  function eventTable(){
    const sec = state.security || {};
    return `<table class="security-table"><tr><th>Evento</th><th>Cantidad</th></tr>
      <tr><td>Bloqueos de seguridad activados</td><td>${sec.locks||0}/${MAX_SECURITY_LOCKS}</td></tr>
      <tr><td>Salidas de pantalla completa registradas</td><td>${sec.fullscreenExits||0}</td></tr>
      <tr><td>Cambios de ventana o pérdida de foco</td><td>${sec.focusLosses||0}</td></tr>
      <tr><td>Pestaña oculta o minimización</td><td>${sec.hiddenTabs||0}</td></tr>
      <tr><td>Uso de tecla Escape</td><td>${sec.escapeKey||0}</td></tr>
      <tr><td>Intentos de pantallazo / impresión</td><td>${sec.printScreen||0}</td></tr>
      <tr><td>Atajos bloqueados</td><td>${sec.blockedShortcuts||0}</td></tr>
      <tr><td>Clic derecho bloqueado</td><td>${sec.rightClicks||0}</td></tr>
      <tr><td>Códigos docentes incorrectos</td><td>${sec.wrongTeacherCodes||0}</td></tr>
      <tr><td>Portales y transportadores activados</td><td>${state.log.filter(e=>e.type==='portal').length}</td></tr>
      <tr><td>Botones trampa activados</td><td>${state.log.filter(e=>e.type==='trap').length}</td></tr>
      <tr><td>Obstáculos configurados por laberinto</td><td>${OBSTACLE_TOTAL}</td></tr>
      <tr><td>Portales configurados por laberinto</td><td>${PORTAL_TOTAL}</td></tr>
      <tr><td>Botones trampa configurados por laberinto</td><td>${TRAP_TOTAL}</td></tr>
      <tr><td>Eventos registrados en bitácora</td><td>${state.log.length}</td></tr>
    </table>`;
  }
  function answerComparison(a){
    if(a.type === 'statements'){
      const expected = String(a.answer||'').split(/,| y /).map(x=>x.trim()).filter(Boolean);
      const userParts = String(a.user||'').split(/,| y /).map(x=>x.trim()).filter(Boolean);
      return `<div class="comparison-list"><p><strong>Comparación afirmación por afirmación:</strong></p>${['I','II','III'].map(mark=>{
        const ok = expected.includes(mark);
        const marked = userParts.includes(mark) || String(a.user).includes(mark);
        const good = ok===marked;
        return `<div class="mini-check ${good?'yes':'no'}"><strong>${good?'✓':'✗'} ${mark}.</strong> Valor correcto: ${ok?'verdadera, debía marcarse':'falsa, no debía marcarse'}. En tu respuesta: ${marked?'la marcaste':'no la marcaste'}.</div>`;
      }).join('')}</div>`;
    }
    return `<div class="comparison-list"><div class="mini-check ${a.correct?'yes':'no'}"><strong>${a.correct?'✓':'✗'} Comparación:</strong> tu respuesta fue ${escapeHtml(a.user)} y la respuesta esperada era ${escapeHtml(a.answer)}.</div></div>`;
  }
  function detailedQuestions(){
    if(!state.answered.length) return '<p class="muted">No se respondieron preguntas durante esta expedición.</p>';
    return state.answered.map((a,i)=>`
      <article class="question-card">
        <div class="question-top"><span class="num">${i+1}</span><div><h3>${escapeHtml(a.title)} · ${escapeHtml(a.topic)}</h3><p>${kindLabel(a.kind)} · ${questionTypeLabel(a.type)} · ${difficultyLabel(a.difficulty)}</p></div><span class="pill ${a.correct?'ok':'bad'}">${a.correct?'Correcta':'Incorrecta'}</span></div>
        <div class="twocol"><div class="answer-box"><strong>Respuesta del estudiante</strong><p>${escapeHtml(a.user)}</p></div><div class="answer-box"><strong>Respuesta correcta</strong><p>${escapeHtml(a.answer)}</p></div></div>
        <div class="feedback-panel">
          <h4>Retroalimentación específica de esta pregunta</h4>
          <div class="subcard"><strong>Pregunta respondida:</strong><div class="formula">${a.prompt}</div></div>
          <div class="subcard"><strong>Pista disponible:</strong><p>${a.kind==='treasure' ? 'Este reto de tesoro no tenía pista disponible.' : (a.kind==='finalChallenge' ? 'Este guardián final no tenía pista disponible.' : (a.hint || 'Revisar la fórmula central y sustituir con cuidado.'))}</p></div>
          <div class="subcard"><strong>Diagnóstico:</strong><p>${a.correct ? 'Tu procedimiento coincide con la idea central del ejercicio.' : 'Tu respuesta no coincide con la respuesta esperada. El error suele estar en la identificación del centro, el radio, el extremo, el signo, el coeficiente o la reindexación de la serie.'}</p></div>
          <div class="subcard">${answerComparison(a)}</div>
          <div class="subcard"><strong>Pasos necesarios:</strong><ol><li>Identifica la fórmula o serie base que corresponde al problema.</li><li>Sustituye el centro, el coeficiente o el valor indicado sin cambiar la estructura de la serie.</li><li>Aplica razón, raíz, Taylor, Maclaurin, derivación, integración o serie geométrica según el caso.</li><li>Concluye exactamente lo que pide la pregunta y verifica si se requiere revisar extremos.</li></ol></div>
          <div class="subcard"><strong>Procedimiento matemático correcto:</strong><p>${a.solution}</p></div>
          <div class="subcard"><strong>Cómo resolver tu duda:</strong><p>Vuelve a hacer el ejercicio escribiendo primero la fórmula general y luego sustituyendo los datos. Compara tu resultado con cada línea del procedimiento anterior hasta ubicar la diferencia.</p></div>
        </div>
      </article>`).join('');
  }
  const logHtml = state.log.length ? state.log.map((e,i)=>`<tr><td>${i+1}</td><td>${e.time.toLocaleString()}</td><td>${escapeHtml(e.text)}</td></tr>`).join('') : '<tr><td colspan="3">Sin eventos registrados.</td></tr>';

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Informe final · Laberinto Egipcio</title>
    <script>window.MathJax={tex:{inlineMath:[['\\\\(','\\\\)']],displayMath:[['\\\\[','\\\\]']],processEscapes:true},svg:{fontCache:'global'},options:{skipHtmlTags:['script','noscript','style','textarea','pre','code']}};<\/script>
    <script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"><\/script>
    <style>
      :root{--blue:#0b3d79;--blue2:#06234c;--gold:#b8860b;--soft:#f7f9fd;--paper:#fffdf7;--rose:#d63b5f;--ok:#0b7f54;--ink:#10243d;--line:#e7edf5;}
      *{box-sizing:border-box} body{margin:0;background:linear-gradient(180deg,#f4f7fb,#fff);color:var(--ink);font-family:Georgia,'Times New Roman',serif;line-height:1.58;font-size:16px}.page{width:min(980px,calc(100% - 28px));margin:22px auto 56px}.hero,.section{background:var(--paper);border:1px solid #e4eaf3;border-radius:24px;padding:26px;margin:22px 0;box-shadow:0 10px 28px rgba(8,35,74,.08)}.hero{border:3px solid rgba(214,59,95,.55);text-align:center}.stamp{background:linear-gradient(180deg,#143e72,#071f43);color:#fff;border-radius:18px;padding:18px;margin-bottom:18px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.18)}.stamp h1{margin:0;font-size:clamp(2.1rem,6vw,4.3rem);letter-spacing:2px;text-transform:uppercase;color:#fff}.stamp h2{margin:10px 0 0;font-size:clamp(1.25rem,3vw,2.2rem);color:#ffe7a3}.eyebrow{letter-spacing:4px;text-transform:uppercase;color:var(--gold);font-weight:900;font-size:.82rem}.title{font-size:clamp(2rem,5vw,4rem);line-height:.98;color:#072e59;margin:10px 0 8px}.subtitle{font-size:1.55rem;color:#956507;font-weight:900;margin:0 0 16px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:24px 0}.metric{background:linear-gradient(180deg,#0d4780,#061f43);color:#fff;border-radius:18px;padding:18px;text-align:left;min-height:118px}.metric b{font-size:1.9rem;color:#ffde79}.metric span{display:block;text-transform:uppercase;letter-spacing:.8px;font-size:.76rem;font-weight:900;color:#e9f4ff}.metric.red{background:linear-gradient(180deg,#d63b5f,#a80929)}h2{font-size:2rem;color:#072e59;margin:0 0 14px;border-bottom:3px solid rgba(184,134,11,.35);padding-bottom:8px}.bar-row{background:#f6f9fd;border:1px solid #e1e9f3;border-radius:16px;padding:13px 14px;margin:12px 0}.bar-label{display:flex;justify-content:space-between;gap:12px;color:#12365c}.bar-track{height:14px;background:#e7eef8;border-radius:999px;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.08)}.bar-fill{height:100%;background:linear-gradient(90deg,#0b3d79,#19b8ad,#ffd35a);border-radius:999px}.formula-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.formula-card,.question-card{border:1px solid #e0e7f0;border-radius:18px;padding:18px;background:#fff;box-shadow:0 5px 18px rgba(8,35,74,.05)}.formula-card h3{color:#0b3d79;margin-top:0}.formula,.latex{background:#f7faff;border:1px solid #e0e9f4;border-radius:14px;padding:13px;margin:10px 0;overflow-x:auto}.security-table,table{width:100%;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden}th{background:#0b3d79;color:#fff;text-align:left}td,th{padding:12px;border-bottom:1px solid #e8edf5}.question-top{display:flex;align-items:center;gap:13px;margin-bottom:13px}.question-top h3{margin:0;color:#10243d}.question-top p{margin:3px 0 0;color:#617089;font-size:.95rem}.num{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#0b3d79;color:#fff;font-weight:900;flex:0 0 auto}.pill{margin-left:auto;padding:8px 14px;border-radius:999px;font-weight:900}.pill.ok{background:#e5f7ef;color:#0b7f54}.pill.bad{background:#ffedf1;color:#b31336}.twocol{display:grid;grid-template-columns:1fr 1fr;gap:14px}.answer-box{background:#eef6ff;border:1px solid #dbe9f7;border-radius:14px;padding:14px}.answer-box p{margin:6px 0 0}.feedback-panel{background:#fffaf0;border:1px solid #efe1bf;border-radius:18px;padding:16px;margin-top:14px}.feedback-panel h4{font-size:1.1rem;color:#8a620d;margin:0 0 12px}.subcard{background:#fff;border:1px solid #e8edf2;border-radius:13px;padding:12px;margin:10px 0}.mini-check{padding:10px;border:1px solid #e7edf5;border-radius:12px;margin:8px 0}.mini-check.yes{background:#f0fff7}.mini-check.no{background:#fff2f5}.muted{color:#65748a;font-style:italic}.footer{text-align:right;color:#65748a;margin:28px 0}.book-note{background:#fff9e8;border:1px solid #ead8aa;border-radius:16px;padding:15px;margin:18px 0}mjx-container[jax='SVG']{font-size:108%!important;margin:.35em 0}.question-card mjx-container[jax='SVG'],.formula-card mjx-container[jax='SVG']{font-size:112%!important}@media(max-width:760px){.cards{grid-template-columns:repeat(2,1fr)}.formula-grid,.twocol{grid-template-columns:1fr}.page{width:calc(100% - 14px);margin-top:8px}.hero,.section{padding:16px;border-radius:18px}.metric{min-height:94px}.stamp h1{font-size:2.1rem}body{font-size:15px}mjx-container[jax='SVG']{font-size:100%!important}}@media print{body{background:white}.page{width:100%;margin:0}.hero,.section{break-inside:avoid;box-shadow:none}.question-card{break-inside:avoid}.stamp{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style></head><body><main class="page">
      <section class="hero"><div class="stamp"><h1>Informe final</h1><h2>Nota final: ${state.score.toFixed(1)} / 5.0</h2></div><div class="eyebrow">Laberinto Egipcio · Series de potencias</div><div class="title">Expedición Matemática</div><div class="subtitle">Taylor · Maclaurin · Convergencia</div><p>Reporte pedagógico con fórmulas renderizadas en LaTeX, retroalimentación por pregunta, diagnóstico de desempeño y plan de mejora.</p><div class="cards"><div class="metric"><b>${correct}/${total}</b><span>Aciertos globales</span></div><div class="metric"><b>${pct}%</b><span>Porcentaje global</span></div><div class="metric ${state.treasuresFound>=TREASURE_TOTAL?'':'red'}"><b>${state.treasuresFound}/${TREASURE_TOTAL}</b><span>Tesoros</span></div><div class="metric"><b>${score50}/50</b><span>Equivalente sugerido</span></div></div><div class="book-note">Inicio: ${state.startedAt ? state.startedAt.toLocaleString() : 'No registrado'} · Fin: ${finished.toLocaleString()} · Duración: ${elapsedMin} min ${elapsedSec} s · Estado: ${resultLabel}</div></section>
      <section class="section"><h2>1. Resumen del jugador</h2><div class="cards"><div class="metric"><b>${state.score.toFixed(1)}</b><span>Nota en escala 0–5.0</span></div><div class="metric"><b>${state.steps}</b><span>Pasos dados</span></div><div class="metric"><b>${incorrect}</b><span>Errores</span></div><div class="metric"><b>${treasurePct}%</b><span>Avance de tesoros</span></div></div></section>
      <section class="section"><h2>2. Gráficas de desempeño</h2><h3>Por tema</h3>${statRows(byTopic)}<h3>Por tipo de pregunta</h3>${statRows(byType)}<h3>Por dificultad</h3>${statRows(byDifficulty)}</section>
      <section class="section"><h2>3. Fórmulas y teoremas que debe revisar el estudiante</h2><div class="formula-grid">${formulaCards()}</div></section>
      <section class="section"><h2>4. Plan de mejora individual</h2>${improvementPlan()}</section>
      <section class="section"><h2>5. Registro de seguridad y expedición</h2>${eventTable()}<h3>Bitácora de eventos</h3><table><tr><th>#</th><th>Hora</th><th>Evento</th></tr>${logHtml}</table></section>
      <section class="section"><h2>6. Detalle de preguntas respondidas</h2><p class="muted">Cada tarjeta conserva la respuesta esperada, la pista disponible, la retroalimentación específica y el procedimiento que debía seguirse.</p>${detailedQuestions()}</section>
      <div class="footer">Informe generado automáticamente por el juego · Página HTML tipo libro</div>
    </main></body></html>`;
  const blob = new Blob([html], {type:'text/html;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `informe_laberinto_egipcio_tipo_libro_${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function questionTypeLabel(type){
  return {tf:'V/F', statements:'Afirmaciones I, II y III', integer:'Valor entero', choice:'Selección múltiple'}[type] || 'Pregunta';
}
function kindLabel(kind){
  return {regular:'Pregunta regular', treasure:'Tesoro', obstacle:'Obstáculo egipcio', bonus:'Bono egipcio', finalChallenge:'Guardián final'}[kind] || kind;
}


function formatDeviceTime(date=new Date()){
  return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}:${String(date.getSeconds()).padStart(2,'0')}`;
}
function updateDeviceClock(){
  const time = formatDeviceTime();
  if(deviceClockValue) deviceClockValue.textContent = time;
  if(clockHud) clockHud.textContent = time;
  document.querySelectorAll('[data-clock-value]').forEach(el=>{ el.textContent = time; });
}
setInterval(updateDeviceClock, 1000);
updateDeviceClock();

// Seguridad docente
function currentTeacherCode(){
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
}
function normalizeTeacherCode(value){
  return String(value || '').replace(/\D/g,'').slice(0,4);
}
function securityGate(){
  let gate = document.getElementById('securityGate');
  if(!gate){
    gate = document.createElement('section');
    gate.id = 'securityGate';
    gate.className = 'security-gate hidden';
    gate.innerHTML = `<div class="security-card parchment">
      <div class="seal small-seal">𓂀</div>
      <h2>Templo bloqueado</h2>
      <p id="securityReason">Se detectó un evento no permitido.</p>
      <div class="security-clock-inline"><span>Hora del dispositivo</span><strong data-clock-value>--:--:--</strong></div>
      <div class="security-counter" id="securityCounter">Bloqueo 0/${MAX_SECURITY_LOCKS}</div>
      <p class="teacher-only">Solo el docente puede reanudar la partida.</p>
      <label class="teacher-code-label">Clave docente
        <input id="teacherCodeInput" type="password" inputmode="numeric" autocomplete="off" placeholder="****" maxlength="5" />
      </label>
      <div id="teacherCodeError" class="teacher-code-error hidden">Clave incorrecta.</div>
      <button id="teacherUnlockBtn" class="primary">Desbloquear partida</button>
    </div>`;
    document.body.appendChild(gate);
    updateDeviceClock();
    const input = gate.querySelector('#teacherCodeInput');
    gate.querySelector('#teacherUnlockBtn').addEventListener('click', async()=>{
      const given = normalizeTeacherCode(input.value);
      if(given === currentTeacherCode()){
        gate.querySelector('#teacherCodeError').classList.add('hidden');
        input.value = '';
        await enterFullscreen();
        securityLockActive = false;
        gate.classList.add('hidden');
        if(gameRunning && questionModal.classList.contains('hidden') && endModal.classList.contains('hidden') && howModal.classList.contains('hidden')) modalOpen=false;
        addEvent('El docente desbloqueó la partida con clave temporal.', 'good');
        resizeCanvas();
      }else{
        if(state.security) state.security.wrongTeacherCodes = (state.security.wrongTeacherCodes || 0) + 1;
        gate.querySelector('#teacherCodeError').classList.remove('hidden');
        input.value = '';
        input.focus();
      }
    });
    input.addEventListener('keydown', e=>{
      if(e.key === 'Enter'){
        e.preventDefault();
        gate.querySelector('#teacherUnlockBtn').click();
      }
    });
  }
  return gate;
}
function triggerSecurityLock(reason, counterKey){
  if(!gameRunning || state.finishedAt) return;
  const now = performance.now();
  if(securityLockActive || now - lastSecurityEventAt < 700) return;
  lastSecurityEventAt = now;
  keys.clear();
  if(state.security && counterKey) state.security[counterKey] = (state.security[counterKey] || 0) + 1;
  if(state.security) state.security.locks = (state.security.locks || 0) + 1;
  const locks = state.security?.locks || 0;
  addEvent(`Bloqueo de seguridad ${locks}/${MAX_SECURITY_LOCKS}: ${reason}.`, 'bad');
  if(locks >= MAX_SECURITY_LOCKS){
    state.cancelled = true;
    finishGame(`Quiz anulado: se alcanzaron ${MAX_SECURITY_LOCKS}/${MAX_SECURITY_LOCKS} bloqueos de seguridad.`);
    return;
  }
  securityLockActive = true;
  modalOpen = true;
  const gate = securityGate();
  gate.querySelector('#securityReason').textContent = reason;
  gate.querySelector('#securityCounter').textContent = `Bloqueo ${locks}/${MAX_SECURITY_LOCKS}`;
  gate.querySelector('#teacherCodeError').classList.add('hidden');
  updateDeviceClock();
  gate.classList.remove('hidden');
  setTimeout(()=>gate.querySelector('#teacherCodeInput')?.focus(), 80);
}
function blockedShortcut(e){
  const k = String(e.key || '').toLowerCase();
  return (e.ctrlKey && ['p','s','u'].includes(k)) ||
    (e.ctrlKey && e.shiftKey && ['i','j','c'].includes(k)) ||
    k === 'f12';
}

// Eventos UI
function isFullscreen(){ return Boolean(document.fullscreenElement || document.webkitFullscreenElement); }
async function enterFullscreen(){
  const el = document.documentElement;
  try{
    if(!isFullscreen()){
      if(el.requestFullscreen) await el.requestFullscreen();
      else if(el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    }
  }catch(err){
    console.warn('No se pudo activar pantalla completa:', err);
  }
}
function exitFullscreenIfNeeded(){
  try{
    if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
  }catch(err){}
}
function fullscreenGate(){
  let gate = document.getElementById('fullscreenGate');
  if(!gate){
    gate = document.createElement('section');
    gate.id = 'fullscreenGate';
    gate.className = 'fullscreen-gate hidden';
    gate.innerHTML = `<div class="fullscreen-card parchment"><div class="seal small-seal">𓂀</div><h2>Pantalla completa requerida</h2><div class="security-clock-inline"><span>Hora del dispositivo</span><strong data-clock-value>--:--:--</strong></div><p>La expedición debe permanecer en pantalla completa.</p><button id="restoreFullscreenBtn" class="primary">Reingresar en pantalla completa</button></div>`;
    document.body.appendChild(gate);
    updateDeviceClock();
    gate.querySelector('#restoreFullscreenBtn').addEventListener('click', async()=>{
      await enterFullscreen();
      if(isFullscreen()){
        gate.classList.add('hidden');
        if(gameRunning && questionModal.classList.contains('hidden') && endModal.classList.contains('hidden') && howModal.classList.contains('hidden')) modalOpen=false;
        resizeCanvas();
      }
    });
  }
  return gate;
}
function enforceFullscreen(){
  const gate = fullscreenGate();
  if(gameRunning && !isFullscreen()){
    gate.classList.add('hidden');
    triggerSecurityLock('Salida de pantalla completa o intento de abandonar el modo de evaluación', 'fullscreenExits');
  }else if(!securityLockActive){
    gate.classList.add('hidden');
  }
}
document.addEventListener('fullscreenchange',()=>{ enforceFullscreen(); resizeCanvas(); });
document.addEventListener('webkitfullscreenchange',()=>{ enforceFullscreen(); resizeCanvas(); });
document.addEventListener('visibilitychange',()=>{ if(gameRunning && document.hidden) triggerSecurityLock('Pestaña oculta, minimización o intento de cambiar de pantalla', 'hiddenTabs'); if(!document.hidden) enforceFullscreen(); });

Array.from(document.querySelectorAll('.animal-choice')).forEach(btn=>{
  btn.addEventListener('click',()=>{document.querySelectorAll('.animal-choice').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');selectedAnimal=btn.dataset.animal;});
});

async function startGameFromButton(event){
  if(event){ event.preventDefault(); event.stopPropagation(); }
  const btn = document.getElementById('startBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Abriendo la pirámide...'; }

  // Se intenta solicitar pantalla completa de inmediato porque Chrome exige
  // que esta acción esté asociada directamente al clic del usuario. Si el
  // navegador la demora o la rechaza, la partida igualmente se crea y luego
  // se muestra el bloqueo docente de pantalla completa.
  try{ await enterFullscreen(); }catch(err){ console.warn('Pantalla completa pendiente:', err); }

  try{
    resetGame();
    showScreen('game');
    resizeCanvas();
    updateHUD();
    setTimeout(()=>{ resizeCanvas(); enforceFullscreen(); }, 180);
  }catch(err){
    console.error('Error real al iniciar el laberinto:', err);
    alert('No se pudo iniciar el laberinto por un error interno ya registrado en consola. Descarga la versión corregida o abre nuevamente index.html en Chrome.');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = 'Entrar a la pirámide'; }
  }
}
window.startGameFromButton = startGameFromButton;
document.getElementById('startBtn').addEventListener('click', startGameFromButton);

document.getElementById('howBtn').addEventListener('click',()=>howModal.classList.remove('hidden'));
document.getElementById('howGameBtn').addEventListener('click',()=>{modalOpen=true;howModal.classList.remove('hidden');});
document.getElementById('closeHowBtn').addEventListener('click',()=>{howModal.classList.add('hidden'); if(screens.game.classList.contains('active') && questionModal.classList.contains('hidden') && endModal.classList.contains('hidden') && !securityLockActive) modalOpen=false;});
document.getElementById('finishBtn').addEventListener('click',()=>finishGame('Partida finalizada manualmente.'));
document.getElementById('mainMenuBtn').addEventListener('click',()=>{if(confirm('¿Volver al menú principal? Se finalizará la partida actual.')){gameRunning=false;modalOpen=false;fullscreenGate().classList.add('hidden');showScreen('menu');}});
hintBtn.addEventListener('click',()=>{hintText.classList.toggle('hidden'); typesetMath();});
submitAnswerBtn.addEventListener('click',submitAnswer);
continueBtn.addEventListener('click',continueAfterQuestion);
document.getElementById('downloadReportBtn').addEventListener('click',generateReport);
document.getElementById('restartBtn').addEventListener('click',()=>{endModal.classList.add('hidden');modalOpen=false;gameRunning=false;fullscreenGate().classList.add('hidden');showScreen('menu');});

window.addEventListener('keydown',e=>{
  if(e.key === 'Escape' && gameRunning){
    e.preventDefault();
    triggerSecurityLock('Uso de la tecla Escape', 'escapeKey');
    return;
  }
  if(e.key === 'PrintScreen' && gameRunning){
    e.preventDefault();
    triggerSecurityLock('Intento de pantallazo detectado por el navegador', 'printScreen');
    return;
  }
  if(blockedShortcut(e) && gameRunning){
    e.preventDefault();
    triggerSecurityLock('Atajo del navegador no permitido durante el juego', 'blockedShortcuts');
    return;
  }
  if(keyToDir[e.key]){ e.preventDefault(); keys.add(e.key); }
  if(e.key==='Enter' && !questionModal.classList.contains('hidden') && !submitAnswerBtn.classList.contains('hidden')) submitAnswer();
});
window.addEventListener('keyup',e=>{
  if(e.key === 'PrintScreen' && gameRunning){
    e.preventDefault();
    triggerSecurityLock('Intento de pantallazo detectado por el navegador', 'printScreen');
    return;
  }
  if(keyToDir[e.key]){ e.preventDefault(); keys.delete(e.key); }
});
window.addEventListener('blur',()=>{ if(gameRunning) triggerSecurityLock('Cambio de ventana o pérdida de foco', 'focusLosses'); keys.clear(); });
window.addEventListener('contextmenu',e=>{ if(gameRunning){ e.preventDefault(); triggerSecurityLock('Clic derecho o menú contextual no permitido', 'rightClicks'); } });

// Polyfill roundRect si el navegador es antiguo
if(typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect){
  CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){
    r=Math.min(r,w/2,h/2);this.beginPath();this.moveTo(x+r,y);this.arcTo(x+w,y,x+w,y+h,r);this.arcTo(x+w,y+h,x,y+h,r);this.arcTo(x,y+h,x,y,r);this.arcTo(x,y,x+w,y,r);this.closePath();return this;
  };
}
resizeCanvas();
