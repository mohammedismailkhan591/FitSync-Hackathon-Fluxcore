const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const VERSION = 5;
const defaultState = {
  version: VERSION, user: null, profile: {},
  water: 0, meals: 0, steps: 0, sleep: 0, stress: 0,
  stretched: false, energy: 'medium', xp: 0, streak: 0,
  challenge: 0, workouts: 0, consistency: 0, activeDays: [],
  mealCalories: 0, mealProtein: 0, routine: [false,false,false,false,false], journey: []
};
let state = clone(defaultState);
let onboardingStep = 0;
let editingProfile = false;
let activeWorkout = null;
let workoutDone = [];
let workoutTimers = {};
let timerSeconds = 300;
let timerInterval = null;

function clone(x){ return JSON.parse(JSON.stringify(x)); }
function userKey(email){ return `fitsync:v${VERSION}:${String(email).trim().toLowerCase()}`; }
function getUsers(){ try{return JSON.parse(localStorage.getItem('fitsync:users')||'{}')}catch{return{}} }
function saveUsers(x){localStorage.setItem('fitsync:users',JSON.stringify(x));}
function save(){
  if(state.user?.email){
    recordJourneySnapshot();
    localStorage.setItem(userKey(state.user.email),JSON.stringify(state));
  }
  updateUI();
}
function load(email){ try{const x=JSON.parse(localStorage.getItem(userKey(email))||'null'); if(x?.version===VERSION){x.journey=x.journey||[];return x;}}catch{} return clone(defaultState); }
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

  // Sign-up is intentionally local only. No backend/Supabase account is created here.
  const users=getUsers();
  if(users[email]){ $('#signupMessage').textContent='Account already exists. Please login.'; return; }
  users[email]={name,password};
  saveUsers(users);
  state=clone(defaultState);
  state.user={name,email};
  save();
  editingProfile=false;
  openApp();
  openOnboarding();
});
$('#loginForm').addEventListener('submit',e=>{
  e.preventDefault();
  const email=$('#loginEmail').value.trim().toLowerCase(),password=$('#loginPassword').value;
  $('#loginMessage').textContent='';
  const users=getUsers();
  if(!users[email]||users[email].password!==password){
    $('#loginMessage').textContent='Email or password is incorrect.';
    return;
  }
  state=load(email);
  state.user={name:users[email].name,email};
  save();
  openApp();
  toast('Welcome back — your saved plan is loaded.');
  if(!state.profile.goal)openOnboarding();
});
function openApp(){$('#authScreen').classList.add('hidden');$('#app').classList.remove('hidden');$('#avatar').textContent=firstName().charAt(0).toUpperCase();navigate('home');} 
$('#logoutBtn').addEventListener('click',()=>{state=clone(defaultState);$('#app').classList.add('hidden');$('#authScreen').classList.remove('hidden');$('#loginMessage').textContent='';$('#loginForm').reset();toast('Logged out.');});
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
  updateAdaptive();renderProfile();renderBars();
}
function updateAdaptive(){const msg={low:'Low energy: choose 8–10 minutes of mobility or an easy walk.',medium:'Good energy: your balanced session is ready.',high:'High energy: choose the strength plan plus a short cardio finisher.'}[state.energy];$('#adaptiveResult').textContent=msg;const action=state.meals<2?'Log your next meal.':state.water<targets().water?'Drink some water.':state.workouts===0?'Start your first workout.':'Keep your streak alive with one small action.';$('#heroText').textContent=action;$('#todayPlan').innerHTML=`<div class="plan-item"><b>🏋️ Workout</b><span>${workoutRecommendation()}</span></div><div class="plan-item"><b>🥗 Nutrition</b><span>${state.meals}/3 meals logged</span></div><div class="plan-item"><b>💧 Hydration</b><span>${state.water}/${targets().water} glasses</span></div><div class="plan-item"><b>😴 Recovery</b><span>${state.sleep?state.sleep+'h logged':'Check in today'}</span></div>`;}
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
function startWorkout(name){activeWorkout=workoutData.find(w=>w.name===name);workoutDone=activeWorkout.items.map(()=>false);$('#workoutModalTitle').textContent=activeWorkout.name;renderWorkoutModal();$('#workoutModal').classList.remove('hidden');}
function renderWorkoutModal(){$('#workoutModalList').innerHTML=activeWorkout.items.map((x,i)=>`<div class="workout-step ${workoutDone[i]?'completed':''}"><div class="step-number">${i+1}</div><div><h4>${x[0]}</h4><p>${x[1]} • ${x[3]}</p></div><div class="step-tools"><span class="timer-pill" id="timer-${i}"></span><button class="set-timer" data-i="${i}">${workoutTimers[i]?'Stop timer':'⏱ Timer'}</button><button class="mark-exercise" data-i="${i}">${workoutDone[i]?'DONE ✓':'MARK DONE'}</button></div></div>`).join('');$$('.mark-exercise').forEach(b=>b.addEventListener('click',()=>{const i=Number(b.dataset.i);workoutDone[i]=!workoutDone[i];renderWorkoutModal();}));$$('.set-timer').forEach(b=>b.addEventListener('click',()=>startExerciseTimer(Number(b.dataset.i))));$('#finishWorkoutBtn').disabled=!workoutDone.every(Boolean);}
function startExerciseTimer(i){if(workoutTimers[i]){clearInterval(workoutTimers[i]);delete workoutTimers[i];renderWorkoutModal();return}let left=activeWorkout.items[i][2];const el=()=>document.querySelector(`#timer-${i}`);workoutTimers[i]=setInterval(()=>{left--;const e=el();if(e)e.textContent=`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`;if(left<=0){clearInterval(workoutTimers[i]);delete workoutTimers[i];toast('Timer finished — now perform the exercise and mark it done.');renderWorkoutModal();}},1000);renderWorkoutModal();}
function closeWorkout(){Object.values(workoutTimers).forEach(clearInterval);workoutTimers={};$('#workoutModal').classList.add('hidden');activeWorkout=null;workoutDone=[];}
$('#closeWorkoutBtn').addEventListener('click',closeWorkout);$('#cancelWorkoutBtn').addEventListener('click',closeWorkout);$('#workoutModal').addEventListener('click',e=>{if(e.target.id==='workoutModal')closeWorkout()});$('#finishWorkoutBtn').addEventListener('click',()=>{if(!activeWorkout||!workoutDone.every(Boolean))return;state.workouts++;state.xp+=40;state.streak=Math.max(1,state.streak+1);logActivity();save();const n=activeWorkout.name;closeWorkout();toast(`${n} completed. +40 XP`);navigate('progress');});

/* DIET + RECIPES */
const meals=[
 {id:'breakfast',time:'BREAKFAST',name:'Protein Power Oats',desc:'Oats + yogurt/milk + banana + nuts',cal:420,protein:20,tags:'High fiber • Easy',ingredients:['50 g oats','150 g yogurt or milk','1 banana','10 g nuts/seeds','Cinnamon'],steps:['Mix oats with yogurt or milk.','Add sliced banana and nuts.','Add cinnamon and serve.']},
 {id:'lunch',time:'LUNCH',name:'Balanced Fuel Bowl',desc:'Rice + dal/chicken/paneer + vegetables',cal:560,protein:28,tags:'Balanced • Protein first',ingredients:['1 cup cooked rice','1 cup dal OR 120 g chicken/paneer','1 cup mixed vegetables','Lemon and spices'],steps:['Cook or reheat the rice.','Add your protein choice and vegetables.','Season, add lemon and serve.']},
 {id:'snack',time:'SNACK',name:'Yogurt Fruit Crunch',desc:'Yogurt + fruit + seeds',cal:240,protein:12,tags:'Quick • High protein',ingredients:['150 g yogurt','1 fruit','1 tsp seeds'],steps:['Add yogurt to a bowl.','Top with fruit and seeds.']},
 {id:'dinner',time:'DINNER',name:'Light Recovery Plate',desc:'Roti + paneer/egg + salad',cal:480,protein:25,tags:'Recovery • Flexible',ingredients:['2 roti','100 g paneer OR 2 eggs','1–2 cups salad','Curd or raita'],steps:['Prepare roti and protein.','Add a large salad.','Serve with curd/raita.']}
];
const foods=[['Paneer','265 kcal / 100g','Protein • Calcium'],['Chicken breast','165 kcal / 100g','High protein'],['Oats','150 kcal / 40g','Fiber'],['Peanut butter','190 kcal / 32g','Healthy fats'],['Rice','205 kcal / cooked cup','Carbohydrate'],['Banana','105 kcal / medium','Carbohydrate • Potassium'],['Eggs','72 kcal / egg','Protein'],['Lentils','230 kcal / cooked cup','Protein • Fiber']];
function renderMeals(){const selected=state.profile.diet||'No preference';$('#mealGrid').innerHTML=meals.slice(0,3).map(m=>`<article class="meal-card"><span class="meal-icon">${m.id==='breakfast'?'🌅':m.id==='lunch'?'☀️':'🌙'}</span><div><small>${m.time}</small><h3>${m.name}</h3><p>${m.desc}</p><b>${m.cal} kcal • ${m.protein}g protein</b><div class="meal-actions"><button class="recipe-btn" data-recipe="${m.id}">Recipe</button><button data-eat="${m.id}">✓ Mark eaten</button></div></div></article>`).join('')+`<p class="muted diet-preference">Diet preference: <b>${selected}</b>. Recipes use flexible substitutions where possible.</p>`;$$('[data-eat]').forEach(b=>b.addEventListener('click',()=>{const m=meals.find(x=>x.id===b.dataset.eat);addMeal(m)}));$$('[data-recipe]').forEach(b=>b.addEventListener('click',()=>openRecipe(b.dataset.recipe)));}
function openRecipe(id){const m=meals.find(x=>x.id===id);$('#recipeContent').innerHTML=`<div class="recipe-content"><span class="eyebrow">${m.time}</span><h2>${m.name}</h2><p class="recipe-meta">${m.cal} kcal • ${m.protein}g protein • ${m.tags}</p><h4>Ingredients</h4><ul>${m.ingredients.map(x=>`<li>${x}</li>`).join('')}</ul><h4>Preparation</h4><ol>${m.steps.map(x=>`<li>${x}</li>`).join('')}</ol><button class="primary-btn" id="recipeEatBtn">Mark this meal eaten ✓</button></div>`;$('#recipeModal').classList.remove('hidden');$('#recipeEatBtn').addEventListener('click',()=>{addMeal(m);closeRecipe()})}
function closeRecipe(){$('#recipeModal').classList.add('hidden')}$('#closeRecipeBtn').addEventListener('click',closeRecipe);$('#recipeModal').addEventListener('click',e=>{if(e.target.id==='recipeModal')closeRecipe()});
$('#foodSearch').addEventListener('input',e=>{const q=e.target.value.toLowerCase();renderFoods(q)});function renderFoods(q=''){$('#foodGrid').innerHTML=foods.filter(f=>f.join(' ').toLowerCase().includes(q)).map(f=>`<div class="food-item"><div><b>${f[0]}</b><small>${f[1]} • ${f[2]}</small></div><button type="button" title="Food info">i</button></div>`).join('')||'<p class="muted">No food found. Try another search.</p>'}

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

/* AMI — fitness-only interactive assistant */
const amiKeywords=['fitness','workout','exercise','gym','muscle','strength','cardio','running','walking','steps','protein','calorie','calories','diet','food','meal','recipe','water','hydration','sleep','recovery','weight','fat','goal','stretch','mobility','fitness','training','squat','pushup','push-up','yoga','stress','beginner','routine','nutrition'];
function amiIsFitness(q){const l=q.toLowerCase();return amiKeywords.some(k=>l.includes(k));}
function amiReply(q){
 const l=q.toLowerCase(),p=state.profile||{};
 if(!amiIsFitness(q))return "I'm Ami, FitSync's fitness-only assistant. I can help with workouts, nutrition, recipes, recovery, sleep, hydration, goals and healthy habits. Ask me something fitness-related.";
 if(l.includes('today')&&l.includes('workout'))return `Based on your profile, I'd start with ${workoutRecommendation().toLowerCase()}. Your current energy is ${state.energy==='low'?'low':'good/high'}, so keep the session practical and stop if you feel pain or unusual symptoms.`;
 if(l.includes('budget')||l.includes('cheap')||l.includes('afford'))return 'For budget-friendly protein, try dal, chana, soya chunks, eggs (if you eat them), peanuts and sattu. Pair simple staples like rice/roti with a protein source and vegetables. Open Diet & Recipes for recipe ideas and substitutions.';
 if(l.includes('protein'))return `Your current planning target is ${targets().protein} g/day. Spread protein across meals using foods you enjoy; your logged protein so far today is ${state.mealProtein} g.`;
 if(l.includes('sleep'))return 'Aim for a consistent sleep schedule and protect your wind-down time. For most adults, 7+ hours is a useful general target; FitSync also uses your sleep check-in to adjust recovery messaging.';
 if(l.includes('water')||l.includes('hydration'))return `Your current planning target is about ${targets().water} L/day. Sip across the day and increase attention to hydration with heat and exercise. You have logged ${state.water} glasses.`;
 if(l.includes('recipe')||l.includes('eat')||l.includes('food'))return 'Tell me the food you have — for example “rice and dal” — and I can suggest a simple fitness-friendly meal idea. You can also search the Diet Encyclopedia for recipes.';
 if(l.includes('weight')||l.includes('fat'))return `Your profile goal is ${p.goal||'not set'}. Focus on sustainable habits: regular movement, appropriate food portions, protein-rich meals, sleep and consistency rather than rapid changes.`;
 if(l.includes('beginner'))return 'Start with 2–3 manageable sessions per week, learn technique, and progress gradually. FitSync has Full Body Builder and Rescue Workout options for different time constraints.';
 if(l.includes('stress')||l.includes('recovery'))return 'Recovery matters. Use the Recovery page to log sleep and stress, then choose lighter movement or mobility when your recovery is limited.';
 return 'Good fitness question. I can help you choose a workout, plan a meal, improve recovery, set habits or understand your FitSync targets. What would you like to work on?';
}
function amiAdd(text,who='bot'){const box=$('#amiMessages');if(!box)return;const d=document.createElement('div');d.className=`ami-msg ${who}`;d.textContent=text;box.appendChild(d);box.scrollTop=box.scrollHeight;}
function openAmi(){const panel=$('#amiPanel');panel.classList.remove('hidden');if(!$('#amiMessages').children.length)amiAdd(`Hi ${firstName()}! I'm Ami ✦. I only answer fitness-related questions. Ask me about your workout, food, sleep, recovery or goals.`)}
$('#amiLauncher').addEventListener('click',openAmi);$('#amiClose').addEventListener('click',()=>$('#amiPanel').classList.add('hidden'));$$('[data-ami]').forEach(b=>b.addEventListener('click',()=>{openAmi();const q=b.dataset.ami;amiAdd(q,'user');setTimeout(()=>amiAdd(amiReply(q)),250)}));$('#amiForm').addEventListener('submit',e=>{e.preventDefault();const input=$('#amiInput'),q=input.value.trim();if(!q)return;amiAdd(q,'user');input.value='';setTimeout(()=>amiAdd(amiReply(q)),250)});

/* Wrap the existing UI update so new modules stay in sync. */
const fitsyncOriginalUpdateUI=updateUI;
updateUI=function(){fitsyncOriginalUpdateUI();renderJourney();renderMilestones();};


/* INIT */
renderWorkoutCards();renderMeals();renderFoods();renderRoutine();updateQuote();coachAdvice();updateUI();
