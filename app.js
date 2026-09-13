const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const VERSION = 7;
const defaultState = {
  version: VERSION, user: null, profile: {},
  water: 0, meals: 0, steps: 0, sleep: 0, stress: 0,
  stretched: false, energy: 'medium', xp: 0, streak: 0,
  challenge: 0, workouts: 0, consistency: 0, activeDays: [],
  mealCalories: 0, mealProtein: 0, routine: [false,false,false,false,false], journey: [], recipeFavorites: [], completedExercises: 0
};
let state = clone(defaultState);
let onboardingStep = 0;
let editingProfile = false;
let activeWorkout = null;
let workoutDone = [];
let workoutVerified = [];
let workoutTimers = {};
let workoutTimerLeft = {};
let workoutRpe = 5;
let timerSeconds = 300;
let timerInterval = null;


/* THEME — Light / Dark only */
(function initTheme(){
  const key='fitsync:theme';
  const apply=(mode)=>{
    const actual=mode==='light'?'light':'dark';
    document.documentElement.dataset.theme=actual;
    const icon=$('#themeIcon'), label=$('#themeLabel'), btn=$('#themeToggle');
    if(icon) icon.textContent=actual==='dark'?'☀':'☾';
    if(label) label.textContent=actual==='dark'?'Light':'Dark';
    if(btn) btn.setAttribute('aria-label',actual==='dark'?'Switch to light mode':'Switch to dark mode');
  };
  const saved=localStorage.getItem(key)==='light'?'light':'dark';
  apply(saved);
  window.addEventListener('DOMContentLoaded',()=>{
    apply(localStorage.getItem(key)==='light'?'light':'dark');
    $('#themeToggle')?.addEventListener('click',()=>{
      const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
      localStorage.setItem(key,next); apply(next); toast(`${next==='dark'?'Dark':'Light'} mode enabled.`);
    });
  });
})();

function clone(x){ return JSON.parse(JSON.stringify(x)); }
function userKey(email){ return `fitsync:v${VERSION}:${String(email).trim().toLowerCase()}`; }
const CLOUD_ENABLED = !!window.FitSyncCloud?.enabled;
let recoveryMode = false;
let cloudUserId = null;
let cloudSaveTimer = null;
function save(){
  if(state.user?.email){
    recordJourneySnapshot();
    localStorage.setItem(userKey(state.user.email),JSON.stringify(state));
    if(CLOUD_ENABLED && cloudUserId){
      clearTimeout(cloudSaveTimer);
      cloudSaveTimer=setTimeout(()=>window.FitSyncCloud.saveState(cloudUserId,state),350);
    }
  }
  updateUI();
}
function loadCached(email){ try{const x=JSON.parse(localStorage.getItem(userKey(email))||'null'); if(x?.version===VERSION){x.journey=x.journey||[];return x;}}catch{} return null; }
async function loadCloudState(userId,email){
  if(!CLOUD_ENABLED) return null;
  try{
    const x=await window.FitSyncCloud.loadState(userId);
    if(x?.state?.version===VERSION){ x.state.journey=x.state.journey||[]; localStorage.setItem(userKey(email),JSON.stringify(x.state)); return x.state; }
  }catch(err){ console.warn('FitSync cloud load failed',err); }
  return null;
}
function recordJourneySnapshot(){
  if(!state.user?.email)return;
  if(!Array.isArray(state.journey))state.journey=[];
  const d=today(), t=targets();
  const snap={date:d,weight:Number(state.profile.weight)||null,consistency:state.consistency||0,protein:state.mealProtein||0,sleep:state.sleep||0,strength:state.workouts||0,calories:state.mealCalories||0};
  const i=state.journey.findIndex(x=>x.date===d);
  if(i>=0)state.journey[i]=snap;else state.journey.push(snap);
  state.journey=state.journey.slice(-90);
}
function toast(msg){const t=$('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove('show'),2200)}
function firstName(){return state.user?.name?.trim().split(/\s+/)[0]||'Athlete'}
function today(){return new Date().toISOString().slice(0,10)}
function logActivity(){const d=today();if(!state.activeDays.includes(d))state.activeDays.push(d);state.activeDays=state.activeDays.slice(-30);let streak=0;let cursor=new Date();for(;;){const key=cursor.toISOString().slice(0,10);if(!state.activeDays.includes(key))break;streak++;cursor.setDate(cursor.getDate()-1);}state.streak=streak;state.consistency=Math.min(100,Math.round(state.activeDays.length/7*100));}

/* AUTH */
$$('.auth-tab').forEach(b=>b.addEventListener('click',()=>{
  $$('.auth-tab').forEach(x=>x.classList.toggle('active',x===b));
  $('#loginForm').classList.toggle('hidden',b.dataset.auth!=='login');
  $('#signupForm').classList.toggle('hidden',b.dataset.auth!=='signup');
}));
$('#signupForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const name=$('#signupName').value.trim(),email=$('#signupEmail').value.trim().toLowerCase(),password=$('#signupPassword').value;
  $('#signupMessage').textContent='';
  if(!CLOUD_ENABLED){$('#signupMessage').textContent='Production setup is incomplete. Connect Supabase first.';return;}
  $('#signupMessage').textContent='Creating your secure account…';
  const {data,error}=await window.FitSyncCloud.signUp(email,password,name);
  if(error){$('#signupMessage').textContent=error.message||'Could not create account.';return;}
  if(!data.session){$('#signupMessage').textContent='Account created. Check your email to confirm, then log in.';return;}
  cloudUserId=data.user?.id||data.session?.user?.id||null;
  state=clone(defaultState); state.user={name,email}; save();
  editingProfile=false; openApp(); openOnboarding();
});
$('#forgotPasswordBtn').addEventListener('click',async()=>{
  const email=$('#loginEmail').value.trim().toLowerCase();
  if(!email){$('#loginMessage').textContent='Enter your email first.';return;}
  if(!CLOUD_ENABLED){$('#loginMessage').textContent='Production setup is incomplete. Connect Supabase first.';return;}
  $('#loginMessage').textContent='Sending password reset email…';
  const {error}=await window.FitSyncCloud.resetPassword(email);
  $('#loginMessage').textContent=error?(error.message||'Could not send reset email.'):'If an account exists for that email, a reset link has been sent.';
});
$('#resetPasswordForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const p=$('#newPassword').value;
  const c=$('#confirmPassword').value;
  if(p.length<8){$('#resetMessage').textContent='Use at least 8 characters.';return;}
  if(p!==c){$('#resetMessage').textContent='Passwords do not match.';return;}
  const {error}=await window.FitSyncCloud.updatePassword(p);
  if(error){$('#resetMessage').textContent=error.message||'Could not update password.';return;}
  $('#resetMessage').textContent='Password updated. You can now continue using FitSync.';
  setTimeout(()=>{recoveryMode=false;$('#resetModal').classList.add('hidden');},900);
});

$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=$('#loginEmail').value.trim().toLowerCase(),password=$('#loginPassword').value;
  $('#loginMessage').textContent='';
  if(!CLOUD_ENABLED){$('#loginMessage').textContent='Production setup is incomplete. Connect Supabase first.';return;}
  $('#loginMessage').textContent='Signing you in securely…';
  const {data,error}=await window.FitSyncCloud.signIn(email,password);
  if(error){$('#loginMessage').textContent=error.message||'Email or password is incorrect.';return;}
  cloudUserId=data.user?.id||data.session?.user?.id||null;
  const cloud=await loadCloudState(cloudUserId,email);
  state=cloud||loadCached(email)||clone(defaultState);
  state.user={name:state.user?.name||data.user?.user_metadata?.name||email.split('@')[0],email};
  save(); openApp(); toast('Welcome back — your cloud profile is synced.');
  if(!state.profile.goal)openOnboarding();
});
function openApp(){$('#authScreen').classList.add('hidden');$('#app').classList.remove('hidden');$('#avatar').textContent=firstName().charAt(0).toUpperCase();navigate('home');} 
$('#logoutBtn').addEventListener('click',async()=>{if(CLOUD_ENABLED)await window.FitSyncCloud.signOut();cloudUserId=null;state=clone(defaultState);$('#app').classList.add('hidden');$('#authScreen').classList.remove('hidden');$('#loginMessage').textContent='';$('#loginForm').reset();toast('Logged out.');});
$('#resetProgressBtn').addEventListener('click',resetProgress);
$('#profileResetBtn').addEventListener('click',resetProgress);
function resetProgress(){if(!state.user)return;if(!confirm('Reset only your fitness progress? Your profile will stay saved.'))return;const profile=clone(state.profile),user=clone(state.user);state=clone(defaultState);state.user=user;state.profile=profile;save();renderRoutine();renderMeals();renderBars();toast('Progress reset to zero.');}

/* NAV */
const pageNames={home:'OVERVIEW',workouts:'WORKOUTS',diet:'DIET & RECIPES',routine:'DAILY ROUTINE',recovery:'RECOVERY',progress:'PROGRESS',coach:'AI COACH',profile:'MY PROFILE',sources:'SOURCES'};
$$('.nav-item').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
$$('[data-page-jump]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.pageJump)));
function navigate(page){$$('.page').forEach(p=>p.classList.remove('active'));$(`#page-${page}`)?.classList.add('active');$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('#pageLabel').textContent=pageNames[page]||'OVERVIEW';$('#sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'smooth'});updateUI();}
$('#menuBtn').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
$('#avatar').addEventListener('click',()=>navigate('profile'));

/* ONBOARDING */
const steps=[
 {title:'About you',intro:'Basic information helps FitSync personalize targets.',fields:[
  ['age','Age','number','18','Your age in years.'],['gender','Gender','choice',['Female','Male','Non-binary','Prefer not to say'],''],['height','Height (cm)','number','170','Used for planning estimates.'],['weight','Current weight (kg)','number','70','Used for planning estimates.'],['targetWeight','Target weight (kg)','number','70','Your desired direction.'],['bodyType','Body type','choiceDef',['Ectomorph','Mesomorph','Endomorph'],'Traditional body-shape categories; not medical classifications.'] ]},
 {title:'Fitness & goals',intro:'Tell us where you are starting and what success means to you.',fields:[
  ['experience','Gym experience','choice',['Beginner','Intermediate','Advanced'],''],['goal','Primary goal','choice',['Build muscle','Lose fat','Improve strength','Improve endurance','General fitness','Athletic performance'],''],['fitnessRating','How would you rate your fitness?','choice',['1 — New to fitness','2 — Getting started','3 — Average','4 — Fit','5 — Very fit'],''],['workoutDays','Days per week','choice',['1–2 days','3 days','4 days','5 days','6–7 days'],''],['minutes','Time per workout','choice',['15–20 min','30 min','45 min','60 min','60+ min'],''],['workoutTime','Preferred workout time','choice',['Morning','Midday','Evening','Flexible'],''],['equipment','Equipment access','choice',['No equipment','Home basics','Dumbbells','Full gym','Mixed'],''] ]},
 {title:'Food & nutrition',intro:'Your food preferences help us make recipes realistic.',fields:[
  ['diet','Specific diet','choice',['No preference','Vegetarian','Non-vegetarian','Vegan','Eggetarian','Other'],''],['allergies','Food allergies / intolerances','text','None','Example: lactose, peanuts, gluten.'],['foodLikes','Foods you enjoy','text','Rice, oats, fruit','Optional'],['mealsPerDay','Meals per day','choice',['2','3','4','5'],''],['activity','Daily activity level','choice',['Sedentary','Lightly active','Moderately active','Very active'],''] ]},
 {title:'Health & lifestyle',intro:'These questions are for safety-aware suggestions. Keep private details minimal.',fields:[
  ['health','Any health condition or injury we should consider?','text','None','If yes, FitSync will show a safety reminder rather than diagnose or treat.'],['smoke','Do you smoke?','choice',['No','Occasionally','Yes','Prefer not to say'],''],['alcohol','Do you consume alcohol?','choice',['No','Occasionally','Regularly','Prefer not to say'],''],['sleepTarget','Typical sleep duration','choice',['< 5 hours','5–6 hours','6–7 hours','7–8 hours','8+ hours'],''],['stressLevel','Current stress level','choice',['Low','Moderate','High'],''],['motivation','What motivates you most?','choice',['Strength','Appearance','Health','Confidence','Competition','Routine'],''],['athlete','Do you want an athletic-performance focus?','choice',['No','Yes'],''] ]},
 {title:'FitSync preferences',intro:'One last step — tell us how you found us and review your plan.',fields:[
  ['referral','Where did you hear about FitSync?','choice',['College / University','Friend','Instagram','YouTube','Google','Gym','Hackathon / Event','Other'],''],['nameNote','Anything else you want your plan to consider?','text','I want a simple plan I can stick to.','Optional'] ]}
];
function openOnboarding(){onboardingStep=0;$('#onboardingModal').classList.remove('hidden');renderOnboarding();}
$('#closeOnboarding').addEventListener('click',()=>{if(!state.profile.goal&&!editingProfile){toast('Complete your profile to unlock personalized plans.');return}$('#onboardingModal').classList.add('hidden')});
$('#onboardingBack').addEventListener('click',()=>{if(onboardingStep>0){collectOnboarding();onboardingStep--;renderOnboarding();}});
$('#onboardingNext').addEventListener('click',()=>{if(!collectOnboarding())return;if(onboardingStep<steps.length-1){onboardingStep++;renderOnboarding();}else{state.profile.complete=true;save();$('#onboardingModal').classList.add('hidden');renderProfile();toast('Your FitSync profile and plan are ready.');}});
function renderOnboarding(){const s=steps[onboardingStep];$('#onboardingTitle').textContent=s.title;$('#onboardingStepLabel').textContent=`Step ${onboardingStep+1} of ${steps.length}`;$('#onboardingBack').style.visibility=onboardingStep===0?'hidden':'visible';$('#onboardingNext').textContent=onboardingStep===steps.length-1?'Create my plan ✓':'Next →';$('#stepper').innerHTML=steps.map((_,i)=>`<span class="step-dot ${i<=onboardingStep?'active':''}"></span>`).join('');$('#onboardingContent').innerHTML=`<p class="muted">${s.intro}</p><div class="onboarding-grid">${s.fields.map(fieldHTML).join('')}</div>`;populateFields();}
function fieldHTML(f){const [key,label,type,val,help]=f;if(key==='nameNote')return `<div class="field full"><label>${label}<textarea id="ob-${key}" rows="3" placeholder="${val}"></textarea><small>${help}</small></label></div>`;if(type==='choiceDef')return `<div class="field full"><label>${label}</label><div class="choice-grid">${val.map(v=>`<button type="button" class="choice" data-ob-key="${key}" data-value="${v}"><b>${v}</b><small>${definition(v)}</small></button>`).join('')}</div><small>${help}</small></div>`;if(type==='choice')return `<div class="field"><label>${label}</label><div class="choice-grid">${val.map(v=>`<button type="button" class="choice" data-ob-key="${key}" data-value="${v}"><b>${v}</b></button>`).join('')}</div><small>${help}</small></div>`;return `<div class="field"><label>${label}<input id="ob-${key}" type="${type}" placeholder="${val}"></label><small>${help}</small></div>`;}
function definition(v){return {Ectomorph:'Traditionally described as a leaner frame with difficulty gaining mass.',Mesomorph:'Traditionally described as a naturally muscular or athletic-looking frame.',Endomorph:'Traditionally described as a rounder frame with easier weight gain.'}[v]||''}
function populateFields(){$$('.choice[data-ob-key]').forEach(b=>{b.classList.toggle('selected',state.profile[b.dataset.obKey]===b.dataset.value);b.addEventListener('click',()=>{$$(`.choice[data-ob-key="${b.dataset.obKey}"]`).forEach(x=>x.classList.remove('selected'));b.classList.add('selected');state.profile[b.dataset.obKey]=b.dataset.value;});});steps[onboardingStep].fields.forEach(f=>{const el=$(`#ob-${f[0]}`);if(el&&state.profile[f[0]]!=null)el.value=state.profile[f[0]];});}
function collectOnboarding(){const s=steps[onboardingStep];for(const f of s.fields){const key=f[0];const el=$(`#ob-${key}`);if(el&&el.value.trim())state.profile[key]=el.value.trim();if(['age','height','weight','targetWeight'].includes(key)&&el&&el.value&&Number(el.value)<=0){toast('Please enter realistic positive values.');return false;}}
if(onboardingStep===0&&!state.profile.age){toast('Please enter your age.');return false}if(onboardingStep===0&&!state.profile.weight){toast('Please enter your current weight.');return false}return true;}
$('#editProfileBtn').addEventListener('click',()=>{editingProfile=true;openOnboarding()});

/* TARGET CALCULATOR */
function activityFactor(){return {'Sedentary':1.2,'Lightly active':1.375,'Moderately active':1.55,'Very active':1.725}[state.profile.activity]||1.35}
function targets(){const p=state.profile,w=Number(p.weight)||70,h=Number(p.height)||170,a=Number(p.age)||30;let bmr=10*w+6.25*h-5*a+(p.gender==='Male'?5:(p.gender==='Female'?-161:-78));let tdee=bmr*activityFactor();let cal=tdee;if(p.goal==='Lose fat'||p.goal==='Lose weight')cal=tdee*.85;if(p.goal==='Build muscle')cal=tdee*1.08;let protein=w*(p.goal==='Build muscle'||p.goal==='Improve strength'?1.7:1.5);let fat=Math.round(cal*.27/9);let fiber=Math.round(cal/1000*14);let water=Math.max(6,Math.round(w*.035));return {cal:Math.round(cal),protein:Math.round(protein),fat,fiber,water};}
function targetLabel(){const t=targets();if(Number(state.profile.age)<18)return {cal:'Age <18: professional guidance',protein:'Professional guidance',fat:'Professional guidance',fiber:'Professional guidance',water:'Hydration varies'};return {cal:`${t.cal} kcal`,protein:`${t.protein} g`,fat:`${t.fat} g`,fiber:`${t.fiber} g`,water:`${t.water} L`}}

/* DASHBOARD */
const quotes=[['Small progress is still progress.','— FitSync'],['You do not need a perfect workout. You need to start.','— FitSync'],['Consistency turns ordinary actions into extraordinary results.','— FitSync'],['One healthy choice can restart the whole day.','— FitSync'],['Train for the life you want to live.','— FitSync'],['Your future self will thank you for showing up today.','— FitSync']];
function updateQuote(){const [q,a]=quotes[Math.floor(Math.random()*quotes.length)];$('#dailyQuote').textContent=q;$('#quoteAuthor').textContent=a}
$('#newQuoteBtn').addEventListener('click',updateQuote);
$$('[data-action]').forEach(b=>b.addEventListener('click',()=>{const a=b.dataset.action;if(a==='water')addWater();if(a==='meal')addMeal();if(a==='steps')addSteps();}));
function addWater(){const t=targets();if(state.water<t.water*1.25){state.water++;state.xp+=5;logActivity();save();toast('+1 glass logged.')}else toast('Hydration entry limit reached for today.');}
function addMeal(meal){if(state.meals>=3){toast('Three meals are already logged today.');return}state.meals++;state.xp+=10;state.mealCalories+=meal?.cal||0;state.mealProtein+=meal?.protein||0;logActivity();save();toast('Meal marked eaten. +10 XP');renderMeals();}
function addSteps(){state.steps+=500;state.xp+=3;logActivity();save();toast('+500 steps logged.');}
function updateUI(){
  const name=firstName();const h=new Date().getHours();$('#greeting').textContent=(h<12?'Good morning, ':h<17?'Good afternoon, ':'Good evening, ')+name+'.';$('#avatar').textContent=name.charAt(0).toUpperCase();$('#xpValue').textContent=state.xp;$('#sideStreak').textContent=`${state.streak} day streak`;
  $('#waterMetric').textContent=`${state.water} / ${targets().water*1}`;$('#stepsMetric').textContent=state.steps.toLocaleString();$('#mealMetric').textContent=`${state.meals} / 3`;$('#sleepMetric').textContent=state.sleep?`${state.sleep}h`:'Not logged';$('#sleepHours').textContent=state.sleep||0;
  const score=Math.round(([state.water>=targets().water,state.meals>=3,state.steps>=5000,state.sleep>=7].filter(Boolean).length)/4*100);$('#completion').textContent=`${score}%`;$('#completion').parentElement.parentElement.style.background=`conic-gradient(var(--accent) ${score*3.6}deg,#263027 ${score*3.6}deg)`;
  const tl=targetLabel();$('#calorieTarget').textContent=tl.cal;$('#proteinTarget').textContent=tl.protein;$('#fatTarget').textContent=tl.fat;$('#fiberTarget').textContent=tl.fiber;$('#calorieProgress').textContent=state.mealCalories?`${state.mealCalories} logged`:'0 logged';$('#proteinProgress').textContent=state.mealProtein?`${state.mealProtein}g logged`:'0g logged';
  $('#progressStreak').textContent=`${state.streak} days`;$('#progressXP').textContent=state.xp;$('#consistency').textContent=`${state.consistency}%`;$('#workoutsCount').textContent=state.workouts;$('#streakBar').style.width=Math.min(100,state.streak*20)+'%';$('#xpBar').style.width=Math.min(100,state.xp%100)+'%';$('#consistencyBar').style.width=state.consistency+'%';$('#workoutBar').style.width=Math.min(100,state.workouts*20)+'%';
  $('#waterBadge')?.classList.toggle('unlocked',state.water>=targets().water);$('#workoutBadge')?.classList.toggle('unlocked',state.workouts>0);$('#streakBadge')?.classList.toggle('unlocked',state.streak>=3);
  $('#mealScore').textContent=`${state.meals} / 3`;$('#mealScoreBar').style.width=(state.meals/3*100)+'%';const rs=recoveryScore();$('#recoveryScore').textContent=rs===null?'—':rs;$('#recoveryMessage').textContent=rs===null?'Log sleep and stress to calculate your personal check-in.':rs>=80?'Good recovery zone. Keep your routine steady.':rs>=60?'Recovery is okay. Consider a lighter session if you feel tired.':'Recovery looks limited today. Prioritize rest and gentle movement.';$('#coachWater').textContent=`${state.water} / ${targets().water}`;$('#coachMeals').textContent=`${state.meals} / 3`;$('#coachSleep').textContent=state.sleep?`${state.sleep}h`:'Not logged';$('#coachGoal').textContent=state.profile.goal||'Not set';$('#coachEnergy').textContent=state.energy==='low'?'Low':state.energy==='high'?'High':'Good';
  updateAdaptive();
  updateTodayFocus();
  renderProfile();renderBars();
  const mw=$('#momentumWorkout'),mr=$('#momentumRecovery'),mn=$('#momentumNutrition'),mt=$('#momentumText');
  if(mw)mw.textContent=state.workouts?'Session completed':'Ready to train';
  if(mr)mr.textContent=recoveryScore()===null?'Check-in needed':`${recoveryScore()}/100`;
  if(mn)mn.textContent=state.mealProtein>=targets().protein?'Protein target hit':`${Math.max(0,targets().protein-state.mealProtein)}g protein left`;
  if(mt)mt.textContent=state.workouts===0?'Start one verified exercise session today.':state.sleep&&state.sleep<6?'Recovery is your next best move.':'Keep your next small action visible and easy.';
}
function updateAdaptive(){const msg={low:'Low energy: choose 8–10 minutes of mobility or an easy walk.',medium:'Good energy: your balanced session is ready.',high:'High energy: choose the strength plan plus a short cardio finisher.'}[state.energy];$('#adaptiveResult').textContent=msg;const action=state.meals<2?'Log your next meal.':state.water<targets().water?'Drink some water.':state.workouts===0?'Start your first workout.':'Keep your streak alive with one small action.';$('#heroText').textContent=action;$('#todayPlan').innerHTML=`<div class="plan-item"><b>🏋️ Workout</b><span>${workoutRecommendation()}</span></div><div class="plan-item"><b>🥗 Nutrition</b><span>${state.meals}/3 meals logged</span></div><div class="plan-item"><b>💧 Hydration</b><span>${state.water}/${targets().water} glasses</span></div><div class="plan-item"><b>😴 Recovery</b><span>${state.sleep?state.sleep+'h logged':'Check in today'}</span></div>`;}
function updateTodayFocus(){
  const title=$('#todayFocusTitle'),text=$('#todayFocusText'); if(!title||!text)return;
  let t='Start with one practical win.',d='FitSync will choose your next best action from what you have actually logged.';
  if(recoveryScore()!==null && recoveryScore()<60){t='Protect recovery today.';d='Your current recovery check-in is limited, so a lighter session or mobility is the better next step.'}
  else if(state.workouts===0){t='Complete your first verified workout.';d='Your biggest opportunity today is creating a real workout data point so progress can start tracking.'}
  else if(state.mealProtein<targets().protein){t='Close your protein gap.';d=`You have logged ${state.mealProtein}g protein; your planning target is ${targets().protein}g. Choose a protein-rich meal that fits your diet.`}
  else if(state.water<targets().water){t='Bring hydration back on track.';d=`You have logged ${state.water} of ${targets().water} glasses. Add water gradually through the day.`}
  else{t='Keep the next action easy to finish.';d='Your main targets are on track. Maintain consistency rather than adding unnecessary volume.'}
  title.textContent=t;text.textContent=d;
}
$('#whyFocusBtn')?.addEventListener('click',()=>{const t=$('#todayFocusTitle')?.textContent||'today’s focus';toast(`Why: ${t} — based only on your logged FitSync data.`)});

function workoutRecommendation(){if(state.energy==='low')return 'Mobility • 10 min';if(state.energy==='high')return 'Strength + finisher • 35 min';return state.profile.goal==='Improve endurance'?'Cardio intervals • 18 min':'Full Body Builder • 25 min';}
$$('[data-energy]').forEach(b=>b.addEventListener('click',()=>{state.energy=b.dataset.energy;$$('[data-energy]').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');state.xp+=1;save();toast('Energy updated.');}));

/* WORKOUTS */
const workoutData=[
 {name:'Full Body Builder',type:'strength',time:25,level:'Beginner friendly',goal:'Strength',items:[['Bodyweight Squats','12 reps',45,'Keep chest tall; knees track over toes.'],['Push-ups','8–10 reps',45,'Keep your body in one line; use an incline if needed.'],['Bent-over Row','12 reps',45,'Hinge at hips and pull elbows back.'],['Reverse Lunges','10 / leg',45,'Step back softly and drive through the front foot.'],['Plank','30 sec',30,'Brace your core and keep hips level.']]},
 {name:'Pulse Runner',type:'cardio',time:18,level:'Beginner',goal:'Endurance',items:[['Easy Walk','3 min',180,'Warm up at a comfortable pace.'],['Brisk Walk','2 min',120,'Increase pace while staying controlled.'],['Easy Jog','2 min',120,'Light jog; keep breathing steady.'],['Brisk Walk','2 min',120,'Recover while keeping moving.'],['Easy Walk','3 min',180,'Cool down gradually.']]},
 {name:'Desk Reset',type:'mobility',time:10,level:'All levels',goal:'Mobility',items:[['Neck Mobility','60 sec',60,'Turn and tilt gently; never force range.'],['Shoulder Rolls','60 sec',60,'Roll smoothly backward and forward.'],['Hip Opener','2 min',120,'Move slowly and breathe through the stretch.'],['Spinal Rotation','2 min',120,'Rotate gently from the upper back.'],['Box Breathing','3 min',180,'Slow, even breaths.']]},
 {name:'Rescue Workout',type:'quick',time:7,level:'No equipment',goal:'Consistency',items:[['Squats','12 reps',30,'Controlled down, strong drive up.'],['Push-ups','8 reps',30,'Use a wall or incline if needed.'],['Mountain Climbers','20 reps',30,'Keep shoulders stacked over hands.'],['Plank','30 sec',30,'Brace your core and breathe steadily.']]}
];
function renderWorkoutCards(filter='all'){$('#workoutGrid').innerHTML=workoutData.filter(w=>filter==='all'||w.type===filter).map(w=>`<article class="workout-card"><div class="workout-visual">${w.type==='strength'?'🏋️':w.type==='cardio'?'🏃':w.type==='mobility'?'🧘':'⚡'}</div><span>${w.type.toUpperCase()} • ${w.time} MIN</span><h3>${w.name}</h3><p>${w.items.map(x=>x[0]).join(' · ')}</p><small class="muted">${w.level} • Goal: ${w.goal}</small><button class="outline-btn start-workout" data-workout="${w.name}">Start practical session →</button></article>`).join('');$$('.start-workout').forEach(b=>b.addEventListener('click',()=>startWorkout(b.dataset.workout)));}
$$('.filter').forEach(b=>b.addEventListener('click',()=>{$$('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderWorkoutCards(b.dataset.filter)}));
function startWorkout(name){activeWorkout=workoutData.find(w=>w.name===name);workoutDone=activeWorkout.items.map(()=>false);workoutVerified=activeWorkout.items.map(()=>false);workoutTimerLeft={};workoutRpe=5;$('#workoutModalTitle').textContent=activeWorkout.name;renderWorkoutModal();$('#workoutModal').classList.remove('hidden');}
function renderWorkoutModal(){if(!activeWorkout)return;const completed=workoutDone.filter(Boolean).length;$('#workoutModalList').innerHTML=activeWorkout.items.map((x,i)=>{const left=workoutTimerLeft[i]||0;const canMark=workoutVerified[i]&&!workoutDone[i];const video=`https://www.youtube.com/results?search_query=${encodeURIComponent('proper form '+x[0]+' exercise')}`;return `<div class="workout-step ${workoutDone[i]?'completed':''}"><div class="step-number">${i+1}</div><div><h4>${x[0]}</h4><p>${x[1]} • ${x[3]}</p><a class="video-link" href="${video}" target="_blank" rel="noreferrer">▶ Watch form guide</a></div><div class="step-tools"><span class="timer-pill" id="timer-${i}">${left?formatSeconds(left):workoutVerified[i]?'✓ Ready':''}</span><button class="set-timer" data-i="${i}" ${workoutDone[i]?'disabled':''}>${workoutTimers[i]?'Stop timer':workoutVerified[i]?'✓ Work timer done':'⏱ Start work timer'}</button><button class="mark-exercise" data-i="${i}" ${(!canMark||workoutDone[i])?'disabled':''}>${workoutDone[i]?'DONE ✓':canMark?'I DID IT ✓':'Complete timer first'}</button></div></div>`}).join('');$$('.mark-exercise').forEach(b=>b.addEventListener('click',()=>{const i=Number(b.dataset.i);if(!workoutVerified[i])return;workoutDone[i]=true;state.completedExercises=(state.completedExercises||0)+1;renderWorkoutModal();}));$$('.set-timer').forEach(b=>b.addEventListener('click',()=>startExerciseTimer(Number(b.dataset.i))));$('#workoutProgress').textContent=`${completed}/${activeWorkout.items.length} exercises verified`;$('#finishWorkoutBtn').disabled=!workoutDone.every(Boolean);}
function formatSeconds(sec){return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`}
function startExerciseTimer(i){if(workoutDone[i])return;if(workoutTimers[i]){clearInterval(workoutTimers[i]);delete workoutTimers[i];renderWorkoutModal();return}let left=activeWorkout.items[i][2];workoutTimerLeft[i]=left;renderWorkoutModal();const el=()=>document.querySelector(`#timer-${i}`);workoutTimers[i]=setInterval(()=>{left--;workoutTimerLeft[i]=left;const e=el();if(e)e.textContent=formatSeconds(Math.max(0,left));if(left<=0){clearInterval(workoutTimers[i]);delete workoutTimers[i];delete workoutTimerLeft[i];workoutVerified[i]=true;toast('Work timer complete. Now perform the movement and confirm it.');renderWorkoutModal();}},1000);}
function closeWorkout(){Object.values(workoutTimers).forEach(clearInterval);workoutTimers={};workoutTimerLeft={};$('#workoutModal').classList.add('hidden');activeWorkout=null;workoutDone=[];workoutVerified=[];}
$('#closeWorkoutBtn').addEventListener('click',closeWorkout);$('#cancelWorkoutBtn').addEventListener('click',closeWorkout);$('#workoutModal').addEventListener('click',e=>{if(e.target.id==='workoutModal')closeWorkout()});$('#workoutRpe')?.addEventListener('change',e=>workoutRpe=Number(e.target.value));$('#finishWorkoutBtn').addEventListener('click',()=>{if(!activeWorkout||!workoutDone.every(Boolean))return;state.workouts++;state.xp+=40+Math.min(10,Math.max(0,10-workoutRpe));state.lastWorkout={name:activeWorkout.name,date:today(),rpe:workoutRpe,exercises:activeWorkout.items.length};logActivity();save();const n=activeWorkout.name;closeWorkout();toast(`${n} verified. +${40+Math.min(10,Math.max(0,10-workoutRpe))} XP`);navigate('progress');});

/* DIET + RECIPES */
const meals=[
 {id:'breakfast',time:'BREAKFAST',name:'Protein Power Oats',desc:'Oats + yogurt/milk + banana + nuts',cal:420,protein:20,tags:'High fiber • Easy',ingredients:['50 g oats','150 g yogurt or milk','1 banana','10 g nuts/seeds','Cinnamon'],steps:['Mix oats with yogurt or milk.','Add sliced banana and nuts.','Add cinnamon and serve.']},
 {id:'lunch',time:'LUNCH',name:'Balanced Fuel Bowl',desc:'Rice + dal/chicken/paneer + vegetables',cal:560,protein:28,tags:'Balanced • Protein first',ingredients:['1 cup cooked rice','1 cup dal OR 120 g chicken/paneer','1 cup mixed vegetables','Lemon and spices'],steps:['Cook or reheat the rice.','Add your protein choice and vegetables.','Season, add lemon and serve.']},
 {id:'snack',time:'SNACK',name:'Yogurt Fruit Crunch',desc:'Yogurt + fruit + seeds',cal:240,protein:12,tags:'Quick • High protein',ingredients:['150 g yogurt','1 fruit','1 tsp seeds'],steps:['Add yogurt to a bowl.','Top with fruit and seeds.']},
 {id:'dinner',time:'DINNER',name:'Light Recovery Plate',desc:'Roti + paneer/egg + salad',cal:480,protein:25,tags:'Recovery • Flexible',ingredients:['2 roti','100 g paneer OR 2 eggs','1–2 cups salad','Curd or raita'],steps:['Prepare roti and protein.','Add a large salad.','Serve with curd/raita.']}
];
const recipes=[
['Paneer Power Bowl','Lunch','Vegetarian','35 min',520,30,'paneer, rice, vegetables','Cook rice; sauté paneer and vegetables; combine with lemon and spices.'],
['Soya Keema Roti','Dinner','Vegetarian','30 min',430,28,'soya, roti, onion, tomato','Soak and crumble soya; cook with onion, tomato and spices; serve with roti.'],
['Moong Dal Chilla','Breakfast','Vegetarian','20 min',310,20,'moong dal, onion, coriander','Blend soaked dal; add vegetables; cook thin pancakes on a hot pan.'],
['Besan Chilla','Breakfast','Vegetarian','15 min',290,16,'besan, onion, tomato, spices','Mix besan batter; add vegetables; cook both sides until firm.'],
['Egg Bhurji Roti','Breakfast','Eggetarian','15 min',390,25,'eggs, onion, tomato, roti','Scramble eggs with vegetables and spices; serve with roti.'],
['Chicken Rice Bowl','Lunch','Non-vegetarian','30 min',560,38,'chicken, rice, vegetables','Cook seasoned chicken; combine with cooked rice and vegetables.'],
['Dal Tadka Rice','Lunch','Vegetarian','25 min',470,20,'toor dal, rice, tomato','Cook dal until soft; finish with a small tempering; serve with rice.'],
['Rajma Rice Bowl','Lunch','Vegetarian','35 min',510,19,'rajma, rice, tomato','Cook soaked rajma until tender; simmer with tomato and spices; serve with rice.'],
['Chana Masala Roti','Lunch','Vegan','30 min',450,18,'chana, tomato, roti','Simmer cooked chickpeas with tomato and spices; serve with roti.'],
['Sattu Protein Drink','Snack','Vegan','5 min',260,14,'sattu, water, lemon','Whisk sattu with water; add lemon, cumin and a pinch of salt.'],
['Peanut Sattu Toast','Snack','Vegetarian','10 min',330,13,'sattu, peanut butter, bread','Mix sattu with a little water; spread on toast with peanut butter.'],
['Curd Oats Bowl','Breakfast','Vegetarian','5 min',300,15,'oats, curd, banana, seeds','Combine oats and curd; top with banana and seeds.'],
['Overnight Oats','Breakfast','Vegetarian','5 min',360,18,'oats, milk, banana, seeds','Mix ingredients; refrigerate overnight; eat chilled.'],
['Greek Yogurt Fruit Bowl','Snack','Vegetarian','5 min',230,18,'Greek yogurt, fruit, seeds','Add fruit and seeds to yogurt; mix and serve.'],
['Paneer Tikka Wrap','Lunch','Vegetarian','25 min',480,28,'paneer, roti, capsicum','Season paneer and vegetables; pan-cook; wrap in roti with salad.'],
['Tofu Stir Fry','Dinner','Vegan','20 min',360,24,'tofu, mixed vegetables, soy sauce','Pan-sear tofu; add vegetables and cook until crisp-tender.'],
['Soya Pulao','Lunch','Vegan','30 min',490,27,'soya chunks, rice, vegetables','Cook soya; sauté vegetables and rice; combine and steam briefly.'],
['Masoor Dal Soup','Dinner','Vegan','25 min',300,19,'masoor dal, tomato, carrot','Simmer lentils and vegetables until soft; season and serve warm.'],
['Mixed Dal Khichdi','Dinner','Vegetarian','35 min',430,18,'mixed dal, rice, vegetables','Pressure-cook washed dal, rice and vegetables with mild spices.'],
['Vegetable Poha + Peanuts','Breakfast','Vegan','15 min',330,10,'poha, peanuts, onion, vegetables','Rinse poha; sauté onion and vegetables; fold in poha and peanuts.'],
['Upma + Curd','Breakfast','Vegetarian','20 min',340,11,'semolina, vegetables, curd','Toast semolina; cook with vegetables and water; serve with curd.'],
['Peanut Banana Oats','Breakfast','Vegetarian','8 min',390,14,'oats, banana, peanut butter','Cook oats; top with banana and peanut butter.'],
['Chana Salad','Snack','Vegan','10 min',280,14,'chana, cucumber, tomato, lemon','Combine cooked chana and chopped vegetables; add lemon and spices.'],
['Sprouts Chaat','Snack','Vegan','10 min',220,13,'sprouts, tomato, onion, lemon','Mix steamed sprouts with vegetables, lemon and chaat spices.'],
['Paneer Bhurji','Dinner','Vegetarian','20 min',410,27,'paneer, tomato, onion','Crumble paneer; sauté with onion, tomato and spices.'],
['Egg & Veggie Sandwich','Breakfast','Eggetarian','15 min',350,21,'eggs, whole wheat bread, vegetables','Scramble eggs; fill bread with eggs and fresh vegetables.'],
['Chicken Roti Roll','Lunch','Non-vegetarian','20 min',460,35,'chicken, roti, salad','Cook chicken with spices; roll with roti and crunchy salad.'],
['Fish Rice Plate','Dinner','Non-vegetarian','25 min',520,38,'fish, rice, vegetables','Pan-cook fish; serve with rice and a large portion of vegetables.'],
['Dal Palak','Dinner','Vegetarian','25 min',330,20,'dal, spinach, tomato','Cook dal; fold in spinach and tomato; simmer until tender.'],
['Matar Paneer Light','Dinner','Vegetarian','30 min',440,25,'paneer, peas, tomato','Cook tomato base; add peas and paneer; simmer until tender.'],
['Ragi Dosa + Sambar','Breakfast','Vegetarian','30 min',400,16,'ragi flour, rice batter, sambar','Prepare thin dosa; cook until crisp; serve with sambar.'],
['High-Protein Lassi','Snack','Vegetarian','5 min',220,16,'curd, milk, fruit','Blend curd, milk and fruit; avoid added sugar when possible.'],
['Fruit & Seed Chia Bowl','Snack','Vegan','10 min',250,8,'chia, fruit, plant milk','Soak chia in plant milk; chill and top with fruit and seeds.'],
['Rajma Chaat','Snack','Vegan','10 min',300,15,'rajma, onion, tomato, lemon','Mix cooked rajma with chopped vegetables and lemon.'],
['Lentil Pasta Bowl','Lunch','Vegetarian','25 min',480,23,'whole-wheat pasta, lentils, tomato','Cook pasta; simmer lentils in tomato sauce; combine.'],
['Soya Stuffed Paratha','Breakfast','Vegetarian','30 min',460,25,'soya, whole-wheat dough, spices','Prepare soya filling; stuff dough; cook on a hot tawa with minimal oil.'],
['Peanut Chutney Idli','Breakfast','Vegetarian','20 min',380,14,'idli, peanuts, chutney','Steam idli; serve with peanut chutney and sambar.'],
['Tandoori Tofu Bowl','Lunch','Vegan','25 min',420,25,'tofu, yogurt alternative, spices, rice','Marinate tofu; pan-cook or bake; serve with rice and salad.'],
['Vegetable Dal Soup','Dinner','Vegan','25 min',280,17,'moong dal, carrot, spinach','Simmer dal and vegetables until soft; season lightly and serve.'],
['Oats Egg Pancake','Breakfast','Eggetarian','15 min',360,24,'oats, eggs, onion, tomato','Blend oats; mix with eggs and vegetables; cook like a savory pancake.']
].map((r,i)=>({id:`recipe-${i+1}`,name:r[0],meal:r[1],diet:r[2],time:r[3],cal:r[4],protein:r[5],keywords:r[6],steps:r[7].split('; ').map(x=>x.replace(/\.$/,'')),ingredients:r[6].split(', ').map(x=>x.charAt(0).toUpperCase()+x.slice(1))}));
const foods=[
 ['Spinach (raw)','2.9 g P • 3.6 g C • 23 kcal','₹5–8 / 100g','Leafy green'],
 ['Rice (raw)','7.1 g P • 78 g C • 356 kcal','₹4–5 / 100g','White rice'],
 ['Wheat / Atta (raw)','12 g P • 71 g C • 340 kcal','₹3–4 / 100g','Whole wheat'],
 ['Oats (dry)','13 g P • 68 g C • 389 kcal','₹8–12 / 100g','Rolled oats'],
 ['Moong dal (dry)','24 g P • 60 g C • 347 kcal','₹10–13 / 100g','Split green gram'],
 ['Urad dal (dry)','24 g P • 59 g C • 347 kcal','₹11–14 / 100g','Split black gram'],
 ['Masoor dal (dry)','25 g P • 63 g C • 352 kcal','₹8–11 / 100g','Red lentil'],
 ['Toor dal (dry)','22 g P • 63 g C • 343 kcal','₹11–15 / 100g','Pigeon pea dal'],
 ['Chana dal (dry)','22 g P • 60 g C • 360 kcal','₹8–12 / 100g','Bengal gram dal'],
 ['Whole green moong (dry)','24 g P • 63 g C • 347 kcal','₹10–13 / 100g','UnsplIt green gram'],
 ['Rajma (dry)','24 g P • 60 g C • 333 kcal','₹12–16 / 100g','Kidney beans'],
 ['Chickpeas / Kabuli chana (dry)','19 g P • 61 g C • 364 kcal','₹10–14 / 100g','Chickpea'],
 ['Roasted chana (dry)','20 g P • 58 g C • 370 kcal','₹8–12 / 100g','Roasted Bengal gram'],
 ['Ragi (dry)','7.3 g P • 72 g C • 336 kcal','₹6–10 / 100g','Finger millet'],
 ['Besan (dry)','22 g P • 58 g C • 387 kcal','₹9–12 / 100g','Gram flour'],
 ['Soya chunks (dry)','52 g P • 33 g C • 345 kcal','₹12–18 / 100g','Textured soy protein'],
 ['Soybean (dry)','36 g P • 30 g C • 446 kcal','₹10–15 / 100g','Whole soybean'],
 ['Peanuts (dry)','26 g P • 16 g C • 567 kcal','₹6–10 / 100g','Groundnut'],
 ['Peanut butter (regular)','25 g P • 20 g C • 590 kcal','₹15–25 / 100g','Roasted peanut butter'],
 ['High-protein peanut butter','~30 g P • 15 g C • 600 kcal','₹20–35 / 100g','Brand dependent'],
 ['Paneer','18 g P • 6 g C • 265 kcal','₹20–30 / 100g','Indian cottage cheese'],
 ['Tofu','17 g P • 2 g C • 145 kcal','₹15–25 / 100g','Soybean curd'],
 ['Milk (full cream)','3.2 g P • 4.8 g C • 60 kcal','₹5–8 / 100 ml','Cow’s milk'],
 ['Curd / Dahi','3.5 g P • 4.7 g C • 60 kcal','₹5–8 / 100g','Plain curd'],
 ['Greek yogurt (high-protein)','9–10 g P • 4 g C • 70 kcal','₹18–30 / 100g','Strained yogurt'],
 ['Eggs','12.6 g P • 1.1 g C • 143 kcal','₹8–12 / 100g','Whole egg avg.'],
 ['Almonds','21 g P • 22 g C • 579 kcal','₹25–40 / 100g','Dry fruits'],
 ['Pumpkin seeds (raw)','30 g P • 11 g C • 559 kcal','₹20–35 / 100g','Seeds'],
 ['Sunflower seeds (raw)','21 g P • 20 g C • 584 kcal','₹15–30 / 100g','Seeds'],
 ['Sattu','20 g P • 58 g C • 360 kcal','₹8–12 / 100g','Roasted gram flour']
];
function recipeMatchesDiet(r){const d=(state.profile.diet||'No preference').toLowerCase();if(d.includes('vegan'))return r.diet==='Vegan';if(d.includes('vegetarian')&&!d.includes('non'))return r.diet==='Vegetarian'||r.diet==='Vegan';if(d.includes('eggetarian'))return ['Vegetarian','Vegan','Eggetarian'].includes(r.diet);return true;}
function renderMeals(){const selected=state.profile.diet||'No preference';$('#mealGrid').innerHTML=meals.slice(0,3).map(m=>`<article class="meal-card"><span class="meal-icon">${m.id==='breakfast'?'🌅':m.id==='lunch'?'☀️':'🌙'}</span><div><small>${m.time}</small><h3>${m.name}</h3><p>${m.desc}</p><b>${m.cal} kcal • ${m.protein}g protein</b><div class="meal-actions"><button class="recipe-btn" data-recipe="${m.id}">Recipe</button><button data-eat="${m.id}">✓ Mark eaten</button></div></div></article>`).join('')+`<p class="muted diet-preference">Diet preference: <b>${selected}</b>. Open Recipe Explorer below for 40+ ideas.</p>`;$$('[data-eat]').forEach(b=>b.addEventListener('click',()=>{const m=meals.find(x=>x.id===b.dataset.eat);addMeal(m)}));$$('[data-recipe]').forEach(b=>b.addEventListener('click',()=>openRecipe(b.dataset.recipe)));}
function openRecipe(id){const m=meals.find(x=>x.id===id)||recipes.find(x=>x.id===id);if(!m)return;$('#recipeContent').innerHTML=`<div class="recipe-content"><span class="eyebrow">${m.time||m.meal}</span><h2>${m.name}</h2><p class="recipe-meta">${m.cal} kcal • ${m.protein}g protein • ${m.tags||m.diet||'Fitness-friendly'}</p><h4>Ingredients</h4><ul>${m.ingredients.map(x=>`<li>${x}</li>`).join('')}</ul><h4>Preparation</h4><ol>${m.steps.map(x=>`<li>${x}</li>`).join('')}</ol><button class="primary-btn" id="recipeEatBtn">Mark this meal eaten ✓</button></div>`;$('#recipeModal').classList.remove('hidden');$('#recipeEatBtn').addEventListener('click',()=>{addMeal(m);closeRecipe()})}
function recipeRank(r){let score=0;const goal=(state.profile.goal||'').toLowerCase();if(goal.includes('muscle')&&r.protein>=20)score+=5;if(goal.includes('strength')&&r.protein>=20)score+=4;if((state.profile.foodLikes||'').toLowerCase().split(',').some(x=>x.trim()&&r.keywords.includes(x.trim())))score+=2;if(recipeMatchesDiet(r))score+=4;if((state.mealProtein||0)<targets().protein)score+=r.protein/10;return score;}
function renderRecipes(q='',category='All'){const query=q.trim().toLowerCase();const list=recipes.filter(r=>(category==='All'||r.meal===category)&&recipeMatchesDiet(r)).filter(r=>!query||`${r.name} ${r.diet} ${r.meal} ${r.keywords}`.toLowerCase().includes(query)).sort((a,b)=>recipeRank(b)-recipeRank(a));const visible=list.slice(0,48);$('#recipeCount').textContent=`${list.length} recipes`;$('#recipeGrid').innerHTML=visible.map(r=>`<article class="recipe-card"><div class="recipe-card-top"><span>${r.meal}</span><button class="favorite-recipe ${state.recipeFavorites?.includes(r.id)?'active':''}" data-fav="${r.id}" title="Save recipe">${state.recipeFavorites?.includes(r.id)?'♥':'♡'}</button></div><h3>${r.name}</h3><p>${r.diet} • ${r.time} • ${r.protein}g protein</p><div class="recipe-tags"><span>🔥 ${r.cal} kcal</span><span>💪 ${r.protein}g P</span></div><button class="outline-btn recipe-open" data-open-recipe="${r.id}">View recipe →</button></article>`).join('')||'<div class="recipe-empty"><b>No recipe found.</b><span>Try “paneer”, “oats”, “high protein”, “breakfast” or clear the filters.</span></div>';$$('[data-open-recipe]').forEach(b=>b.addEventListener('click',()=>openRecipe(b.dataset.openRecipe)));$$('[data-fav]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.fav;state.recipeFavorites=state.recipeFavorites||[];state.recipeFavorites=state.recipeFavorites.includes(id)?state.recipeFavorites.filter(x=>x!==id):[...state.recipeFavorites,id];save();renderRecipes($('#recipeSearch').value,$('#recipeCategory').value);}));}
$('#foodSearch').addEventListener('input',e=>renderFoods(e.target.value.toLowerCase()));function renderFoods(q=''){const matches=foods.filter(f=>f.join(' ').toLowerCase().includes(q));$('#foodGrid').innerHTML=matches.map(f=>{const parts=f[1].split(' • ');return `<article class="food-item"><div class="food-main"><b>${f[0]}</b><small>${f[3]}</small></div><div class="food-numbers"><span><b>${parts[0].replace(' g P','')}</b><small>Protein</small></span><span><b>${parts[1].replace(' g C','')}</b><small>Carbs</small></span><span><b>${parts[2].replace(' kcal','')}</b><small>kcal</small></span><span><b>${f[2]}</b><small>Approx.</small></span></div></article>`}).join('')||'<p class="muted">No food found. Try another search.</p>'}
$('#recipeSearch').addEventListener('input',e=>renderRecipes(e.target.value,$('#recipeCategory').value));$('#recipeCategory').addEventListener('change',()=>renderRecipes($('#recipeSearch').value,$('#recipeCategory').value));$('#surpriseRecipeBtn').addEventListener('click',()=>{const list=recipes.filter(recipeMatchesDiet);const r=list[Math.floor(Math.random()*list.length)];openRecipe(r.id);toast(`Ami picked ${r.name}.`)});

/* ROUTINE */
const routine=[['07:00','Hydration reset','Drink a glass of water','💧'],['08:00','Fuel up','Eat your planned breakfast','🥗'],['13:30','Movement break','Take a 5-minute screen break','🚶'],['18:00','Training window','Complete the session you chose','💪'],['22:30','Recovery shutdown','Reduce screens and prepare for sleep','☾']];
function renderRoutine(){$('#routineList').innerHTML=routine.map((r,i)=>`<div class="routine-item ${state.routine?.[i]?'done':''}"><span class="time">${r[0]}</span><span class="dot"></span><div><h3>${r[3]} ${r[1]}</h3><p>${r[2]}</p></div><button class="routine-check" data-routine="${i}">${state.routine?.[i]?'DONE ✓':'CHECK'}</button></div>`).join('');$$('[data-routine]').forEach(b=>b.addEventListener('click',()=>{const i=Number(b.dataset.routine);if(!state.routine)state.routine=[false,false,false,false,false];if(state.routine[i]){toast('Already checked — no duplicate XP.');return}state.routine[i]=true;state.xp+=8;logActivity();save();renderRoutine();toast('Routine action logged.')}));}

/* RECOVERY */
$$('[data-sleep]').forEach(b=>b.addEventListener('click',()=>{state.sleep=Math.max(0,Math.min(12,state.sleep+Number(b.dataset.sleep)));save();toast('Sleep check-in updated.')}));
$$('[data-stress]').forEach(b=>b.addEventListener('click',()=>{state.stress=Number(b.dataset.stress);$$('[data-stress]').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');save();toast('Stress check-in updated.')}));
$('#stretchBtn').addEventListener('click',()=>{if(state.stretched){toast('Mobility reset already logged.');return}state.stretched=true;state.xp+=10;logActivity();save();toast('8-minute mobility reset logged.');});
function recoveryScore(){if(!state.sleep&&!state.stress)return null;let score=50;if(state.sleep>=7)score+=25;else if(state.sleep>=6)score+=15;else if(state.sleep>0)score+=5;if(state.stress===1)score+=20;else if(state.stress===2)score+=10;else if(state.stress===3)score-=10;if(state.stretched)score+=5;return Math.max(0,Math.min(100,score))}

/* TIMER */
$('#timerBtn').addEventListener('click',()=>{if(timerInterval){clearInterval(timerInterval);timerInterval=null;$('#timerBtn').textContent='Resume timer';return}$('#timerBtn').textContent='Pause timer';timerInterval=setInterval(()=>{timerSeconds--;$('#timer').textContent=`${String(Math.floor(timerSeconds/60)).padStart(2,'0')}:${String(timerSeconds%60).padStart(2,'0')}`;if(timerSeconds<=0){clearInterval(timerInterval);timerInterval=null;timerSeconds=300;state.xp+=15;logActivity();save();$('#timerBtn').textContent='Start timer';toast('Focus session complete. +15 XP');}},1000)});

/* COACH */
$('#refreshCoach').addEventListener('click',()=>{coachAdvice();toast('Coach recalculated.');});$('#coachActionBtn').addEventListener('click',()=>{if(state.meals<2)return navigate('diet');if(state.water<targets().water)return addWater();if(state.workouts===0)return navigate('workouts');navigate('routine')});
function coachAdvice(){let h,t;if(state.profile.health&&state.profile.health.toLowerCase()!=='none'){h='Safety-first recommendation';t='You mentioned a health condition or injury. Choose gentle, non-painful activity and consider qualified professional guidance before changing training or nutrition significantly.'}else if(state.energy==='low'){h='Protect recovery today';t='Choose Desk Reset or an easy walk. Your goal today is to maintain the habit without forcing intensity.'}else if(state.sleep&&state.sleep<6){h='Recovery comes first';t="Keep today's session easier and prioritize sleep tonight."}else if(state.water<targets().water){h='Hydrate before you train';t='Log a glass of water, then choose your workout.'}else if(state.workouts===0){h='Start with one practical win';t='Open Workouts and complete every exercise manually. Your first completed session unlocks Move Maker.'}else{h='Keep the streak alive';t='You have already started building consistency. Pick one small action you can finish today.'}$('#coachHeadline').textContent=h;$('#coachText').textContent=t;}

/* PROFILE + PROGRESS */
function renderProfile(){const p=state.profile||{};$('#profileTitle').textContent=`${firstName()}'s FitSync blueprint.`;const groups=[['Identity',[['Age',p.age||'Not set'],['Gender',p.gender||'Not set'],['Height',p.height?p.height+' cm':'Not set'],['Weight',p.weight?p.weight+' kg':'Not set'],['Target weight',p.targetWeight?p.targetWeight+' kg':'Not set'],['Body type',p.bodyType||'Not set']]],['Fitness',[['Experience',p.experience||'Not set'],['Primary goal',p.goal||'Not set'],['Fitness rating',p.fitnessRating||'Not set'],['Days/week',p.workoutDays||'Not set'],['Time/session',p.minutes||'Not set'],['Workout time',p.workoutTime||'Not set'],['Equipment',p.equipment||'Not set']]],['Lifestyle',[['Diet',p.diet||'Not set'],['Activity',p.activity||'Not set'],['Sleep',p.sleepTarget||'Not set'],['Stress',p.stressLevel||'Not set'],['Motivation',p.motivation||'Not set'],['Athletic focus',p.athlete||'Not set']]],['Safety & preferences',[['Health/injury',p.health||'None'],['Allergies/intolerances',p.allergies||'None'],['Smoking',p.smoke||'Not set'],['Alcohol',p.alcohol||'Not set'],['Heard about FitSync',p.referral||'Not set'],['Plan note',p.nameNote||'None']]]];$('#profileSummary').innerHTML=groups.map(g=>`<div class="profile-block"><h3>${g[0]}</h3>${g[1].map(r=>`<div class="profile-row"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')}</div>`).join('');}
function renderBars(){const vals=[0,0,0,0,0,0,Math.min(100,state.consistency)];$('#activityBars').innerHTML=vals.map((v,i)=>`<div class="bar-wrap"><div class="bar ${i===6?'today':''}" style="height:${Math.max(3,v)}%"></div><small>${['M','T','W','T','F','S','Today'][i]}</small></div>`).join('')}

/* JOURNEY + MILESTONES */
let journeyMetric='weight';
const journeyMeta={
 weight:{label:'Weight',unit:'kg',format:v=>v?`${v} kg`:'—'},
 consistency:{label:'Consistency',unit:'%',format:v=>`${Math.round(v||0)}%`},
 protein:{label:'Protein avg.',unit:'g',format:v=>`${Math.round(v||0)} g`},
 sleep:{label:'Sleep',unit:'h',format:v=>`${Number(v||0).toFixed(1)} h`},
 strength:{label:'Strength',unit:'sessions',format:v=>`${Math.round(v||0)} sessions`},
 calories:{label:'Calories',unit:'kcal',format:v=>`${Math.round(v||0)} kcal`}
};
function journeyData(){
  const src=(state.journey||[]).slice(-84);
  if(!src.length)return [];
  const weeks=[];
  for(let w=0;w<4;w++){
    const chunk=src.slice(Math.max(0,src.length-(4-w)*21),src.length-(3-w)*21||undefined);
    const c=chunk.length?chunk:src.slice(-1);
    const avg=k=>c.reduce((a,x)=>a+(Number(x[k])||0),0)/c.length;
    weeks.push({label:`Week ${[1,4,8,12][w]}`,weight:avg('weight'),consistency:avg('consistency'),protein:avg('protein'),sleep:avg('sleep'),strength:Math.max(...c.map(x=>Number(x.strength)||0)),calories:avg('calories')});
  }
  return weeks;
}
function renderJourney(){
  const chart=$('#journeyChart'),insight=$('#journeyInsight');if(!chart)return;
  const data=journeyData();
  if(!data.length){chart.innerHTML='<div class="journey-empty">Your journey chart will appear after you log real activity.</div>';insight.textContent='Start with one workout, meal, sleep check-in or hydration action to create your first data point.';return;}
  const meta=journeyMeta[journeyMetric], vals=data.map(x=>Number(x[journeyMetric])||0), min=Math.min(...vals),max=Math.max(...vals),range=max-min||1;
  chart.innerHTML='<div class="journey-line"></div>'+data.map((x,i)=>{const pct=18+((Number(x[journeyMetric])||0)-min)/range*62;return `<div class="journey-point"><div style="height:${pct}%;display:flex;align-items:flex-end"><i title="${meta.format(x[journeyMetric])}"></i></div><b>${meta.format(x[journeyMetric])}</b><small>${x.label}</small></div>`}).join('');
  const first=data[0],last=data[data.length-1];
  if(journeyMetric==='protein'&&first.protein>0){const pct=Math.round(((last.protein-first.protein)/first.protein)*100);insight.textContent=pct>=0?`Your average logged protein is ${Math.abs(pct)}% higher than your first journey point.`:`Your average logged protein is ${Math.abs(pct)}% lower than your first journey point.`}
  else if(journeyMetric==='consistency'){insight.textContent=`You are currently at ${Math.round(last.consistency)}% consistency based on logged active days.`}
  else if(journeyMetric==='sleep'){insight.textContent=last.sleep>=7?'Your latest sleep check-in is in the 7+ hour range. Keep protecting recovery.':'Your latest sleep check-in is below 7 hours; consider prioritizing recovery.'}
  else if(journeyMetric==='strength'){insight.textContent=`You have logged ${Math.round(last.strength)} completed workout${Math.round(last.strength)===1?'':'s'} so far in this journey.`}
  else if(journeyMetric==='calories'){insight.textContent=`Latest logged food energy: ${Math.round(last.calories)} kcal. This is logged food, not a calorie prescription.`}
  else {insight.textContent=last.weight?`Latest recorded body weight: ${last.weight} kg. Focus on sustainable trends rather than day-to-day changes.`:'Weight will appear once a weight value is available in your profile.'}
}
$$('.journey-tab').forEach(b=>b.addEventListener('click',()=>{$$('.journey-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');journeyMetric=b.dataset.journey;renderJourney();}));
const milestoneData=[
 ['FIRST REP','Completed your first workout.','🏆',()=>state.workouts>=1],
 ['CONSISTENCY MODE','7 active days logged.','◈',()=>state.activeDays.length>=7],
 ['PROTEIN LOCKED','Hit your protein target on 5 logged days.','◉',()=>{const t=targets().protein;return (state.journey||[]).filter(x=>x.protein>=t).length>=5}],
 ['IRON WEEK','Completed 3+ workouts in your current journey.','⬢',()=>state.workouts>=3],
 ['RECOVERY KING','Maintained 7+ hours average sleep across 7 check-ins.','☾',()=>{const a=(state.journey||[]).filter(x=>x.sleep>0).slice(-7);return a.length>=7&&a.reduce((s,x)=>s+x.sleep,0)/a.length>=7}]
];
function renderMilestones(){const el=$('#milestoneGrid');if(!el)return;el.innerHTML=milestoneData.map(([name,desc,icon,test])=>{const earned=!!test();return `<article class="milestone-card ${earned?'earned':''}"><span class="milestone-icon">${icon}</span><b>${name}</b><small>${desc}</small><span class="milestone-status">${earned?'✓ EARNED':'LOCKED'}</span></article>`}).join('')}

/* AMI — personalized fitness coach with short-term conversation memory */
const amiBlocked=['politics','president','prime minister','coding','programming','javascript','python','html','css','homework','assignment','math problem','exam','movie','song lyrics','gaming','game cheat','religion','stock market','crypto','legal advice','write an essay'];
const amiFitnessHints=['fitness','workout','exercise','gym','muscle','strength','cardio','running','walking','steps','protein','calorie','calories','diet','food','meal','recipe','water','hydration','sleep','recovery','weight','fat loss','goal','stretch','mobility','training','squat','pushup','push-up','yoga','stress','beginner','routine','nutrition','training plan','workout plan','bodybuilding','muscle gain','weight loss','meal plan','healthy','sore','rest day','progress','form','reps','sets','minutes','equipment','today','tomorrow','schedule','tired','energy'];
let amiConversation=[];
function amiIsFitness(q){
  const l=q.toLowerCase().trim();
  if(!l)return false;
  if(amiBlocked.some(k=>l.includes(k)))return false;
  // Do not require an obvious keyword on the client: questions like
  // "I only have 20 minutes and no equipment" are still valid fitness questions.
  return true;
}
function amiFallbackIsFitness(q){return amiFitnessHints.some(k=>q.toLowerCase().includes(k));}
function amiReply(q){
 const l=q.toLowerCase(),p=state.profile||{};
 if(!amiFallbackIsFitness(q))return "I'm Ami, FitSync's fitness coach. I can help with workouts, nutrition, recipes, recovery, sleep, hydration, goals and healthy habits. Ask me a fitness-related question.";
 if(l.includes('today')&&l.includes('workout'))return `Based on your profile, I'd start with ${workoutRecommendation().toLowerCase()}. Your current energy is ${state.energy==='low'?'low':state.energy==='high'?'high':'moderate'}, so keep the session practical and stop if you feel pain or unusual symptoms.`;
 if(l.includes('budget')||l.includes('cheap')||l.includes('afford'))return 'For budget-friendly protein, try dal, chana, soya chunks, eggs (if you eat them), peanuts and sattu. Pair staples such as rice or roti with a protein source and vegetables.';
 if(l.includes('protein'))return `Your current planning target is ${targets().protein} g/day. You have logged ${state.mealProtein} g today. Spread protein across meals rather than trying to get it all at once.`;
 if(l.includes('sleep'))return `Your sleep check-in is ${state.sleep?state.sleep+' hours':'not logged yet'}. Aim for a consistent schedule and protect your wind-down time. If recovery is poor, FitSync should favor an easier session rather than forcing intensity.`;
 if(l.includes('water')||l.includes('hydration'))return `Your current planning target is about ${targets().water} L/day. You have logged ${state.water} glasses. Sip through the day and pay extra attention to hydration during heat and exercise.`;
 if(l.includes('recipe')||l.includes('eat')||l.includes('food'))return `Tell me what food you have — for example, “I have rice, dal and eggs” — and I can suggest a simple meal idea. Your current diet preference is ${p.diet||'not set'}.`;
 if(l.includes('weight')||l.includes('fat'))return `Your profile goal is ${p.goal||'not set'}. Focus on sustainable habits, appropriate portions, protein-rich meals, movement, sleep and consistency rather than rapid changes.`;
 if(l.includes('beginner'))return 'Start with 2–3 manageable sessions per week, learn technique, and progress gradually. You can use the practical workout flow in FitSync to log each completed exercise.';
 if(l.includes('stress')||l.includes('recovery')||l.includes('tired'))return 'Recovery matters. Log your sleep, stress and energy in FitSync. When recovery is limited, choose lighter movement or mobility instead of trying to compensate with a harder session.';
 return 'Tell me your goal, available time and equipment, and I can turn that into a practical workout or nutrition plan.';
}
function amiAdd(text,who='bot'){
 const box=$('#amiMessages');if(!box)return;
 const d=document.createElement('div');d.className=`ami-msg ${who}`;d.textContent=text;box.appendChild(d);box.scrollTop=box.scrollHeight;
 if(text&&['user','bot'].includes(who)){amiConversation.push({role:who==='user'?'user':'assistant',content:String(text)});amiConversation=amiConversation.slice(-12);}
}
function openAmi(){const panel=$('#amiPanel');panel.classList.remove('hidden');if(!$('#amiMessages').children.length)amiAdd(`Hi ${firstName()}! I'm Ami ✦. I know your FitSync profile and can use your current workout, nutrition and recovery data to give more personalized advice. What are you working on today?`)}
$('#amiLauncher').addEventListener('click',openAmi);
$('#amiClose').addEventListener('click',()=>$('#amiPanel').classList.add('hidden'));
$$('[data-ami]').forEach(b=>b.addEventListener('click',()=>{openAmi();const q=b.dataset.ami;amiAdd(q,'user');askAmi(q)}));
function amiContext(){
 const p=state.profile||{};
 return {
  profile:{name:firstName(),age:p.age,gender:p.gender,height:p.height,weight:p.weight,targetWeight:p.targetWeight,bodyType:p.bodyType,goal:p.goal,experience:p.experience,diet:p.diet,activity:p.activity,fitnessRating:p.fitnessRating,workoutDays:p.workoutDays,minutes:p.minutes,workoutTime:p.workoutTime,equipment:p.equipment,foodLikes:p.foodLikes,mealsPerDay:p.mealsPerDay,motivation:p.motivation,athlete:p.athlete},
  targets:targets(),
  today:{water:state.water,meals:state.meals,steps:state.steps,sleep:state.sleep,stress:state.stress,energy:state.energy,workouts:state.workouts,mealCalories:state.mealCalories,mealProtein:state.mealProtein,consistency:state.consistency,activeDays:state.activeDays?.length||0,lastWorkout:state.lastWorkout||null},
  journey:(state.journey||[]).slice(-14),
  history:amiConversation.slice(-11,-1)
 };
}
async function askAmi(q){
 const typing=document.createElement('div');typing.className='ami-msg bot ami-typing';typing.textContent='Ami is thinking…';$('#amiMessages').appendChild(typing);
 if(window.FitSyncAI?.enabled){
  try{
   const r=await window.FitSyncAI.ask(q,amiContext());
   typing.remove();amiAdd(r);return;
  }catch(err){typing.remove();console.warn('AI coach unavailable',err);}
 }
 setTimeout(()=>amiAdd(amiReply(q)),180);
}
$('#amiForm').addEventListener('submit',e=>{e.preventDefault();const input=$('#amiInput'),q=input.value.trim();if(!q)return;amiAdd(q,'user');input.value='';askAmi(q)});

/* Wrap the existing UI update so new modules stay in sync. */
const fitsyncOriginalUpdateUI=updateUI;
updateUI=function(){fitsyncOriginalUpdateUI();renderJourney();renderMilestones();};


/* INIT */
renderWorkoutCards();renderMeals();renderFoods();renderRecipes();renderRoutine();updateQuote();coachAdvice();updateUI();
