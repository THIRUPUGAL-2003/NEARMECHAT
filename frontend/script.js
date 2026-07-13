// ═══════════════════════════════════════════════════
// PEOPLE DATA
// ═══════════════════════════════════════════════════
const people = [];

// பழைய வரியை நீக்கிவிட்டு இதை மாற்றவும்
const API_URL = window.ENV?.API_URL || "http://localhost:8000";
// Chats
const chatsData = [];

// Posts
let postsData=[];

// My story
let myStory=null;
let myStoryMedia=null;

// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════
let chatSocket = null;
let myLat=13.0827,myLng=80.2707;
let locWatchId=null;
let currentChatIdx=-1;
let aiEnabled=true;
let currentModalPerson=null;
let waveSentSet=new Set();
let followSet=new Set();
let radiusKm=5;
let anthropicKey='';
let activityLog=[];
let myPhotoUrl=null;
let currentStoryPerson=null;
let currentStoryIdx=0;
let storyTimer=null;
let postMediaUrl=null;
let postMediaType=null;
let storyMediaUrl=null;
let storyMediaType=null;

// Voice recording
let mediaRecorder=null;
let audioChunks=[];
let isRecording=false;
let recordingDuration=0;
let recInterval=null;
let recAnimFrame=null;
let recAudioCtx=null;
let recAnalyser=null;
let recStream=null;

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════
function escapeHtmlParam(str) {
  if (!str) return '';
  return encodeURIComponent(str).replace(/'/g, '%27');
}
function fmtDist(km){return km<1?`${Math.round(km*1000)} m`:`${km.toFixed(1)} km`}
function fmtLast(ts) {
  if (!ts) return '';
  if (typeof ts === 'string' && isNaN(Date.parse(ts))) {
    return `Active ${ts}`;
  }
  const parsed = typeof ts === 'number' ? ts : Date.parse(ts);
  if (isNaN(parsed)) return '';
  const d = Math.floor((Date.now() - parsed) / 1000);
  if (d < 60) return `Active ${d}s ago`;
  if (d < 3600) return `Active ${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `Active ${Math.floor(d / 3600)}h ago`;
  return `Active ${Math.floor(d / 86400)}d ago`;
}

function getInterests(id) {
  const interestList = ["🎵 Music", "✈️ Travel", "🍕 Food", "💪 Fitness", "🎨 Art", "📚 Books", "🎮 Gaming", "🏍️ Bikes", "📸 Photo"];
  const list = [];
  const idx1 = id % interestList.length;
  const idx2 = (id + 3) % interestList.length;
  const idx3 = (id + 7) % interestList.length;
  list.push(interestList[idx1]);
  if (idx2 !== idx1) list.push(interestList[idx2]);
  if (idx3 !== idx1 && idx3 !== idx2) list.push(interestList[idx3]);
  return list;
}

function haversineKm(a,b,c,d){const R=6371,dL=(c-a)*Math.PI/180,dG=(d-b)*Math.PI/180,x=Math.sin(dL/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dG/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function updateDistances(){people.forEach(p=>{const k=haversineKm(myLat,myLng,p.lat,p.lng);p.distKm=k;p.dist=fmtDist(k)})}
function filterInRadius(list){return list.filter(p=>(p.distKm||99)<=radiusKm)}
function avHtml(p, size = 38, cls = '') {
  const st = size > 50 ? `width:${size}px;height:${size}px;font-size:${Math.floor(size * .45)}px` : `width:${size}px;height:${size}px;font-size:${Math.floor(size * .42)}px`;
  if (p && p.photoUrl) {
    return `<div class="${cls}" style="${st};border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center"><img src="${p.photoUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none';this.parentNode.innerHTML='${p.initial || '👤'}'"></div>`;
  }
  return `<div class="${cls}" style="${st};border-radius:50%;background:${p ? p.bg : 'var(--dark4)'};color:#fff;font-weight:bold;display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk',sans-serif;">${p ? (p.initial || '👤') : '👤'}</div>`;
}
function myAvHtml(size=38){
  if(myPhotoUrl)return`<img src="${myPhotoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  return`<span style="font-size:${Math.floor(size*.4)}px">😎</span>`;
}

// ═══════════════════════════════════════════════════
// CLOCK
// ═══════════════════════════════════════════════════
// clock removed

// ═══════════════════════════════════════════════════
// API KEY
// ═══════════════════════════════════════════════════
function saveApiKey(){const v=document.getElementById('api-key-input').value.trim();if(!v){toast('⚠️ Paste your Anthropic API key');return}anthropicKey=v;localStorage.setItem('nm_api_key',v);document.getElementById('api-status').innerHTML='<span style="color:var(--green)">✓ Claude AI is active!</span>';toast('✅ API key saved — Claude AI is now live!')}
function loadApiKey(){const k=localStorage.getItem('nm_api_key');if(k){anthropicKey=k;const inp=document.getElementById('api-key-input');if(inp)inp.value=k;const el=document.getElementById('api-status');if(el)el.innerHTML='<span style="color:var(--green)">✓ Claude AI active</span>'}}

// ═══════════════════════════════════════════════════
// PROFILE PHOTO
// ═══════════════════════════════════════════════════
function triggerPhotoUpload(){document.getElementById('profile-photo-input').click()}
function onProfilePhotoChange(input){
  const file=input.files[0];
  if(!file)return;
  
  const token = localStorage.getItem('token');
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (!currentUser) return;
  
  const formData = new FormData();
  formData.append('token', token);
  formData.append('name', currentUser.name);
  formData.append('bio', currentUser.bio || '');
  formData.append('location', currentUser.location || '');
  formData.append('profile_pic', file);
  
  toast('📸 Uploading profile photo...');
  fetch(`${API_URL}/api/profile`, {
    method: 'POST',
    body: formData
  })
  .then(res => res.json())
  .then(result => {
    if (result.user) {
      localStorage.setItem('currentUser', JSON.stringify(result.user));
      let picUrl = result.user.profile_pic;
      if (picUrl && picUrl.startsWith('/uploads')) {
        picUrl = API_URL + picUrl;
      }
      myPhotoUrl = picUrl;
      updateMyAvatars();
      toast('📸 Profile photo updated!');
    } else {
      toast('❌ Photo upload failed');
    }
  })
  .catch(err => {
    console.error(err);
    toast('❌ Photo upload network error');
  });
}
function updateMyAvatars(){
  const bigAv=document.getElementById('my-big-av');
  if(bigAv){if(myPhotoUrl){bigAv.innerHTML=`<img src="${myPhotoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`}else{bigAv.innerHTML='<span id="my-big-emoji">😎</span>'}}
  const sideAv=document.getElementById('sidebar-me-av');
  if(sideAv){if(myPhotoUrl){sideAv.innerHTML=`<img src="${myPhotoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"><div class="me-av-dot"></div>`}else{sideAv.innerHTML='<span id="sidebar-me-emoji">😎</span><div class="me-av-dot"></div>'}}
  const feedAv=document.getElementById('feed-me-av');
  if(feedAv){if(myPhotoUrl){feedAv.innerHTML=`<img src="${myPhotoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`}else{feedAv.innerHTML='<span id="feed-me-emoji">😎</span>'}}
  const postAv=document.getElementById('post-creator-av');
  if(postAv){if(myPhotoUrl){postAv.innerHTML=`<img src="${myPhotoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`}else{postAv.innerHTML='<span id="post-creator-emoji">😎</span>'}}
}
function loadSavedPhoto(){const p=localStorage.getItem('nm_my_photo');if(p){myPhotoUrl=p;updateMyAvatars()}}

// ═══════════════════════════════════════════════════
// GPS
// ═══════════════════════════════════════════════════
function startGPS(){
  if(!navigator.geolocation){document.getElementById('gps-text').textContent='No GPS';simulateGPS();return}
  document.getElementById('gps-text').textContent='Locating…';
  locWatchId=navigator.geolocation.watchPosition(pos=>{
    myLat=pos.coords.latitude;myLng=pos.coords.longitude;
    const acc=Math.round(pos.coords.accuracy);
    document.getElementById('gps-text').textContent=`GPS ±${acc}m`;
    updateDistances();
    if(leafletMap){youMarker&&youMarker.setLatLng([myLat,myLng]);leafletMap.setView([myLat,myLng],14)}
    document.getElementById('map-loc-label').textContent='📍 Your live location';
    updateAllUI();
  },()=>{document.getElementById('gps-text').textContent='Simulated GPS';simulateGPS()},{enableHighAccuracy:true,maximumAge:5000,timeout:10000});
}
function simulateGPS(){
  let vLat=(Math.random()-.5)*.00015,vLng=(Math.random()-.5)*.00015;
  setInterval(()=>{vLat+=(Math.random()-.5)*.00003;vLng+=(Math.random()-.5)*.00003;vLat=Math.max(-.0003,Math.min(.0003,vLat));vLng=Math.max(-.0003,Math.min(.0003,vLng));myLat+=vLat;myLng+=vLng;updateDistances();if(youMarker)youMarker.setLatLng([myLat,myLng]);updateAllUI()},3000);
}
people.forEach(p=>{p.vLat=(Math.random()-.5)*.0003;p.vLng=(Math.random()-.5)*.0003});
function simulatePeopleMovement(){}
function simulateStatusChanges(){}
function simulateIncomingMessages(){}

// ═══════════════════════════════════════════════════
// ACTIVITY FEED
// ═══════════════════════════════════════════════════
function addActivity(p,action,detail,icon){
  const now=new Date();const time=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  activityLog.unshift({emoji:p.emoji,name:p.name,photoUrl:p.photoUrl||null,action,detail,icon,time});
  if(activityLog.length>50)activityLog.pop();
  buildActivityFeed();
}
function buildActivityFeed(){
  const feed=document.getElementById('activity-feed');if(!feed)return;
  if(!activityLog.length){feed.innerHTML='<div style="padding:20px 14px;text-align:center;color:var(--muted);font-size:12px;opacity:.6">Live activity here…</div>';return}
  feed.innerHTML=activityLog.map(a=>`<div class="activity-item">
    <div class="act-av">${a.photoUrl?`<img src="${a.photoUrl}">`:`<span style="font-size:14px">${a.emoji}</span>`}</div>
    <div style="flex:1;min-width:0"><div class="act-name">${a.name}</div><div class="act-msg">${a.action} · ${a.detail}</div><div class="act-time">${a.time}</div></div>
    <div style="font-size:13px">${a.icon}</div>
  </div>`).join('');
}

// ═══════════════════════════════════════════════════
// STORIES
// ═══════════════════════════════════════════════════
function buildStories(){
  const strip=document.getElementById('stories-strip');
  const myRingHtml=`<div class="story-av" onclick="openMyStoryCreator()">
    <div class="story-ring ${myStory?'has-story':'add-ring'}" style="width:46px;height:46px">
      <div class="story-inner">${myPhotoUrl?`<img src="${myPhotoUrl}">`:'<span style="font-size:22px">+</span>'}</div>
    </div><div class="story-lbl">Your story</div>
  </div>`;
  const livePeople=people.filter(p=>p.stories&&p.stories.length>0).slice(0,8);
  const peopleHtml=livePeople.map(p=>`<div class="story-av" onclick="openStory(${p.id})">
    <div class="story-ring ${p.status==='live'?'live-ring':'has-story'}" style="width:46px;height:46px">
      <div class="story-inner">${p.photoUrl?`<img src="${p.photoUrl}">`:`<span style="font-size:18px">${p.emoji}</span>`}</div>
    </div><div class="story-lbl">${p.name.split(' ')[0]}</div>
  </div>`).join('');
  strip.innerHTML=myRingHtml+peopleHtml;
}

function openStory(personId){
  currentStoryPerson=people.find(p=>p.id===personId);
  if(!currentStoryPerson||!currentStoryPerson.stories.length){toast('📖 No story yet');return}
  currentStoryIdx=0;
  renderStoryViewer();
  document.getElementById('story-viewer').classList.add('open');
}
function openPersonStory(){if(currentModalPerson){closeModal();openStory(currentModalPerson.id)}}
function closeStory(){clearTimeout(storyTimer);document.getElementById('story-viewer').classList.remove('open')}
function prevStory(){if(currentStoryIdx>0){currentStoryIdx--;renderStoryViewer()}else closeStory()}
function nextStory(){if(currentStoryPerson&&currentStoryIdx<currentStoryPerson.stories.length-1){currentStoryIdx++;renderStoryViewer()}else closeStory()}
function likeStory(){toast(`❤️ Liked ${currentStoryPerson?.name}'s story!`)}
function sendStoryReply(){const inp=document.getElementById('story-reply-input');const t=inp.value.trim();if(!t)return;toast(`💬 Reply sent to ${currentStoryPerson?.name}!`);inp.value=''}

function renderStoryViewer(){
  if(!currentStoryPerson)return;
  const p=currentStoryPerson;
  const story=p.stories[currentStoryIdx];
  clearTimeout(storyTimer);
  // Avatar
  const svAv=document.getElementById('sv-av');
  svAv.innerHTML=p.photoUrl?`<img src="${p.photoUrl}" style="width:100%;height:100%;object-fit:cover">`:`<span style="font-size:17px">${p.emoji}</span>`;
  document.getElementById('sv-name').textContent=p.name;
  document.getElementById('sv-time').textContent=story.time+' ago';
  // Progress bars
  const progressRow=document.getElementById('story-progress-row');
  progressRow.innerHTML=p.stories.map((s,i)=>`<div class="story-prog-bar"><div class="story-prog-fill ${i<currentStoryIdx?'done':i===currentStoryIdx?'active':''}"></div></div>`).join('');
  // Content
  const content=document.getElementById('story-content');
  const prevBtn='<button class="story-side-btn prev" onclick="prevStory()"><i class="ti ti-chevron-left"></i></button>';
  const nextBtn='<button class="story-side-btn next" onclick="nextStory()"><i class="ti ti-chevron-right"></i></button>';
  if(story.mediaUrl){
    if(story.mediaType==='video'){
      content.innerHTML=`${prevBtn}<video src="${story.mediaUrl}" autoplay loop muted style="width:100%;height:100%;object-fit:contain"></video>${nextBtn}`;
    }else{
      content.innerHTML=`${prevBtn}<img src="${story.mediaUrl}" style="max-width:100%;max-height:100%;object-fit:contain">${nextBtn}`;
    }
  }else{
    content.innerHTML=`${prevBtn}
      <div class="story-slide-gradient" style="background:${story.bg};width:100%;height:100%">
        <div class="story-slide-emoji">${story.emoji}</div>
        <div class="story-slide-text">${story.text}</div>
      </div>${nextBtn}`;
  }
  storyTimer=setTimeout(nextStory,5000);
}

// ═══════════════════════════════════════════════════
// STORY CREATOR
// ═══════════════════════════════════════════════════
function openMyStoryCreator(){document.getElementById('story-creator-modal').classList.add('open')}
function closeStoryCreator(){document.getElementById('story-creator-modal').classList.remove('open');storyMediaUrl=null;storyMediaType=null;document.getElementById('story-preview-area').innerHTML='<i class="ti ti-cloud-upload" style="font-size:36px;opacity:.4"></i><div style="font-size:13px;opacity:.6">Tap to add photo or video</div>';document.getElementById('story-text-input').value=''}
function triggerStoryMediaUpload(){document.getElementById('story-media-input').click()}
function onStoryMediaChange(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    storyMediaUrl=e.target.result;
    storyMediaType=file.type.startsWith('video')?'video':'photo';
    const area=document.getElementById('story-preview-area');
    area.innerHTML=storyMediaType==='video'?`<video src="${storyMediaUrl}" controls style="max-width:100%;max-height:280px;border-radius:12px"></video>`:`<img src="${storyMediaUrl}" style="max-width:100%;max-height:280px;border-radius:12px;object-fit:contain">`;
  };reader.readAsDataURL(file);
}
async function submitStory() {
  const text = document.getElementById('story-text-input').value.trim();
  const token = localStorage.getItem('token');
  const formData = new FormData();
  formData.append('token', token);
  formData.append('text', text || 'Story 📍');
  formData.append('bg_color', 'linear-gradient(135deg,#f0436a,#c44aff)');
  formData.append('media_type', storyMediaType || 'photo');
  
  const fileInput = document.getElementById('story-media-input');
  if (fileInput && fileInput.files && fileInput.files[0]) {
    formData.append('file', fileInput.files[0]);
  }
  
  toast('📤 Posting story...');
  try {
    const response = await fetch(`${API_URL}/api/stories`, {
      method: 'POST',
      body: formData
    });
    if (response.ok) {
      closeStoryCreator();
      toast('✅ Story posted!');
      loadStories();
    } else {
      toast('❌ Failed to post story');
    }
  } catch (err) {
    console.error(err);
    toast('❌ Network error posting story');
  }
}

// ═══════════════════════════════════════════════════
// POSTS / FEED
// ═══════════════════════════════════════════════════
function generatePosts(){
  const postTemplates=[];
  postsData=postTemplates.map((t,i)=>({...t,id:i+1,liked:false}));
}

function openPostCreator(type){document.getElementById('post-modal-bg').classList.add('open');if(type)triggerPostMediaUpload()}
function closePostCreator(){document.getElementById('post-modal-bg').classList.remove('open');postMediaUrl=null;postMediaType=null;document.getElementById('post-preview-area').innerHTML='<i class="ti ti-cloud-upload" style="font-size:36px;opacity:.4"></i><div style="font-size:13px;opacity:.6">Tap to add photo or video</div>';document.getElementById('post-caption-input').value=''}
function triggerPostMediaUpload(){document.getElementById('post-media-input').click()}
function onPostMediaChange(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    postMediaUrl=e.target.result;
    postMediaType=file.type.startsWith('video')?'video':'photo';
    const area=document.getElementById('post-preview-area');
    if(postMediaType==='video')area.innerHTML=`<video src="${postMediaUrl}" controls style="max-width:100%;max-height:280px;border-radius:12px"></video>`;
    else area.innerHTML=`<img src="${postMediaUrl}" style="max-width:100%;max-height:280px;border-radius:12px;object-fit:contain">`;
  };reader.readAsDataURL(file);
}
async function submitPost() {
  const caption = document.getElementById('post-caption-input').value.trim();
  const token = localStorage.getItem('token');
  
  if (!caption && !postMediaUrl) {
    toast('⚠️ Add a caption or media');
    return;
  }
  
  const formData = new FormData();
  formData.append('token', token);
  formData.append('caption', caption);
  formData.append('media_type', postMediaType || 'photo');
  
  const fileInput = document.getElementById('post-media-input');
  if (fileInput && fileInput.files && fileInput.files[0]) {
    formData.append('file', fileInput.files[0]);
  }
  
  toast('📤 Sharing post...');
  try {
    const response = await fetch(`${API_URL}/api/posts`, {
      method: 'POST',
      body: formData
    });
    if (response.ok) {
      closePostCreator();
      toast('✅ Post shared!');
      loadFeed();
    } else {
      toast('❌ Failed to share post');
    }
  } catch (err) {
    console.error(err);
    toast('❌ Network error sharing post');
  }
}
function likePost(id){
  const p=postsData.find(x=>x.id===id);if(!p)return;
  p.liked=!p.liked;p.likes+=p.liked?1:-1;buildFeed();
}
function openImgViewer(src){document.getElementById('img-viewer-img').src=src;document.getElementById('img-viewer').classList.add('open')}
function buildFeed(){
  const list=document.getElementById('posts-list');
  if(!list)return;
  list.innerHTML=postsData.map(post=>{
    const person = post.personId ? people.find(p => p.id === post.personId) : null;
    const name = post.authorName || (person ? person.name : (post.myPost ? 'You' : 'User'));
    const avHtmlStr = post.authorPic ? `<div style="width:38px;height:38px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center"><img src="${post.authorPic}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none';this.parentNode.innerHTML='👤'"></div>` : (person ? avHtml(person, 38) : `<div style="width:38px;height:38px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--grad)">${myPhotoUrl?`<img src="${myPhotoUrl}" style="width:100%;height:100%;object-fit:cover">`:'<span style="font-size:16px">😎</span>'}</div>`);
    let mediaHtml='';
    if(post.mediaUrl){
      if(post.mediaType==='video')mediaHtml=`<div class="post-media-wrap"><video class="post-media" src="${post.mediaUrl}" controls style="width:100%;max-height:360px;display:block"></video></div>`;
      else mediaHtml=`<div class="post-media-wrap" onclick="openImgViewer('${post.mediaUrl}')"><img class="post-media" src="${post.mediaUrl}" alt="post"></div>`;
    }else{
      mediaHtml=`<div class="post-gradient" style="background:${post.bg}"><div style="font-size:60px">${post.emoji}</div><div class="post-caption-overlay">${post.caption}</div></div>`;
    }
    const commentsHtml=post.comments.slice(0,2).map(c=>`<div style="display:flex;gap:6px;padding:6px 14px;font-size:12px"><span style="font-weight:600;color:var(--muted2)">${c.name}</span><span style="color:var(--text)">${c.text}</span></div>`).join('');
    return`<div class="post-card" id="post-${post.id}">
      <div class="post-header">
        ${avHtmlStr}
        <div><div class="post-name">${name}</div><div class="post-meta">${post.time} ago · 📍 Chennai</div></div>
        <div style="margin-left:auto"><button class="icon-btn" style="width:28px;height:28px;font-size:14px" onclick="openPostOptions(${post.id})"><i class="ti ti-dots"></i></button></div>
      </div>
      ${post.mediaUrl?mediaHtml:mediaHtml}
      ${post.mediaUrl&&post.caption?`<div class="post-caption">${post.caption}</div>`:''}
      <div class="post-actions">
        <button class="post-action-btn ${post.liked?'liked':''}" onclick="likePost(${post.id})"><i class="ti ti-heart${post.liked?'-filled':''}"></i>${post.likes}</button>
        <button class="post-action-btn" onclick="openCommentsModal(${post.id})"><i class="ti ti-message-circle"></i>${post.comments.length}</button>
        <button class="post-action-btn" onclick="sharePost(${post.id})"><i class="ti ti-share"></i></button>
        <div style="margin-left:auto;font-size:11px;color:var(--muted)">${post.time} ago</div>
      </div>
      ${commentsHtml}
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════
// AI
// ═══════════════════════════════════════════════════
function toggleAI(el){el.classList.toggle('on');aiEnabled=el.classList.contains('on');const p=document.getElementById('ai-on-pill');if(p)p.style.display=aiEnabled?'inline-flex':'none';toast(aiEnabled?'🤖 AI replies ON':'🔴 AI replies OFF')}
async function getAIReply(person,history,userMsg){
  if(anthropicKey){
    try{
      const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':anthropicKey,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:'claude-opus-4-5',max_tokens:200,system:`You are ${person.name}, a ${person.age}-year-old from Chennai. Bio: "${person.bio}". Interests: ${person.interests.join(', ')}. Reply casually, short (1-3 sentences), with Chennai/Tamil references. Never reveal you are AI.`,messages:[...history.map(h=>({role:h.role,content:h.content})),{role:'user',content:userMsg}]})});
      if(res.ok){const d=await res.json();return d.content?.[0]?.text||smartFallback(person,userMsg)}
    }catch(e){}
  }
  return smartFallback(person,userMsg);
}
function smartFallback(person,msg){
  const m=msg.toLowerCase();
  if(m.includes('hi')||m.includes('hey'))return`Hey! 😊 Saw your profile — we have so much in common especially ${person.interests[0]}!`;
  if(m.includes('where')||m.includes('area'))return`I'm near ${['T-Nagar','Adyar','Anna Nagar','Velachery'][Math.floor(Math.random()*4)]} right now! You close?`;
  if(m.includes('meet')||m.includes('coffee'))return`Yes da! How about Amethyst café or that new place in Alwarpet? ☕ Super chill`;
  if(m.includes('music')||m.includes('concert'))return`${['AR Rahman','Anirudh','Sid Sriram'][Math.floor(Math.random()*3)]} is on repeat rn 🎵 Big fan!`;
  if(m.includes('photo')||m.includes('picture'))return`Oh I saw your recent post — amazing shot! 📸 What camera do you use?`;
  if(m.includes('food'))return`There's this amazing biryani spot near Triplicane 🍛 We should go!`;
  const fallbacks=['That sounds great! 😊','Cool, tell me more!','Haha yes!!','Let\'s plan something 🎉','Wow really?','I\'m nearby rn actually 👀','Chennai gang! 🌊','Da super idea! 🔥','Machan, literally same 😂'];
  return fallbacks[Math.floor(Math.random()*fallbacks.length)];
}

// ═══════════════════════════════════════════════════
// UPDATE ALL
// ═══════════════════════════════════════════════════
function updateAllUI(){
  const key=(document.querySelector('.chip.on')||{dataset:{key:'all'}}).dataset.key;
  buildCards(filterByKey(key));buildNearby();buildMatches();buildStories();
  redrawMapMarkers();
  const live=people.filter(p=>p.status==='live').length;
  const matchCount=people.filter(p=>p.match>=70).length;
  document.getElementById('map-nearby-count').textContent=live;
  document.getElementById('sb-nearby').textContent=people.length;
  document.getElementById('sb-online').textContent=live;
  document.getElementById('sb-matches').textContent=matchCount;
  document.getElementById('prof-nearby').textContent=people.length;
  const rt=document.getElementById('radar-txt');if(rt)rt.textContent=`${live} live nearby`;
}
function filterByKey(key){if(key==='all')return people;if(key==='girls')return people.filter(p=>p.gender==='girl');if(key==='guys')return people.filter(p=>p.gender==='guy');return people.filter(p=>p.interests.some(i=>i.toLowerCase()===key||i.toLowerCase().startsWith(key)))}
function updateBadge(){const total=chatsData.reduce((a,c)=>a+(c.unread||0),0);const b=document.getElementById('chat-badge');b.textContent=total;b.style.display=total>0?'':'none';const dot=document.getElementById('bell-dot');if(dot)dot.style.display=total>0?'block':'none'}
function onRadiusChange(v){radiusKm=parseFloat(v);document.getElementById('radius-val').textContent=`${v} km`;buildCards(filterByKey((document.querySelector('.chip.on')||{dataset:{key:'all'}}).dataset.key))}

// ═══════════════════════════════════════════════════
// BUILD CARDS
// ═══════════════════════════════════════════════════
function buildCards(list){
  const g=document.getElementById('cards-grid');
  const filtered=list.filter(p=>(p.distKm||99)<=radiusKm);
  if(!filtered.length){g.innerHTML='<div class="empty-state" style="grid-column:1/-1"><i class="ti ti-map-pin-off"></i><p>No one in '+radiusKm+'km radius</p></div>';return}
  g.innerHTML=filtered.map(p=>`<div class="card" onclick="openModal(${p.id})">
    <div class="card-img" style="background:${p.bg}; display:flex; align-items:center; justify-content:center; overflow:hidden; position:relative;">
      ${p.photoUrl?`<img class="card-img-photo" src="${p.photoUrl}" alt="${p.name}" style="width:100%; height:100%; object-fit:cover;">`:`<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:44px; font-weight:800; color:#fff; font-family:'Space Grotesk',sans-serif; text-shadow:0 2px 10px rgba(0,0,0,0.25);">${p.initial || '👤'}</div>`}
      <div class="online-dot${p.status==='live'?' live':''}" style="background:${p.status==='live'?'#19f090':'#f5a623'}"></div>
      <div class="match-pill">${p.match}%</div>
      <div class="dist-pill"><i class="ti ti-map-pin" style="font-size:10px"></i>${p.dist}</div>
      ${p.stories&&p.stories.length?'<div style="position:absolute;inset:0;border:3px solid var(--pink);border-radius:17px;pointer-events:none;opacity:.5"></div>':''} 
    </div>
    <div class="card-body">
      <div class="card-name">${p.name}, ${p.age}</div>
      <div class="card-status"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${p.status==='live'?'#19f090':'#f5a623'}"></span>${p.status==='live'?'Live now':'Away'}${p.stories&&p.stories.length?` · <span style="color:var(--pink);font-size:10px">Story</span>`:''}</div>
      <div class="card-tags">${p.interests.map(t=>`<span class="tag">${t}</span>`).join('')}</div>
      ${p.lastSeen?`<div style="font-size:9.5px;color:var(--muted);margin-top:5px;font-style:italic">${fmtLast(p.lastSeen)}</div>`:''}
    </div>
  </div>`).join('');
}
function buildNearby(){
  const sorted=[...people].sort((a,b)=>(a.distKm||99)-(b.distKm||99));
  document.getElementById('nearby-list').innerHTML=sorted.map(p=>`<div class="nearby-item" onclick="openModal(${p.id})">
    <div class="n-av" style="background:${p.bg}; display:flex; align-items:center; justify-content:center; overflow:hidden; color:#fff; font-weight:bold; font-family:'Space Grotesk',sans-serif;">
      ${p.photoUrl?`<img src="${p.photoUrl}" style="width:100%;height:100%;object-fit:cover">`:`${p.initial || '👤'}`}
      <div class="n-av-dot${p.status==='live'?' live':''}" style="background:${p.status==='live'?'#19f090':'#f5a623'}"></div>
    </div>
    <div class="n-info"><div class="n-name">${p.name}, ${p.age}</div><div class="n-sub">${p.interests.slice(0,2).join(' · ')}</div>${p.lastSeen?`<div style="font-size:9.5px;color:var(--muted)">${fmtLast(p.lastSeen)}</div>`:''}</div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
      <div class="n-dist">${p.dist}</div>
      ${p.status==='live'?'<div style="font-size:9px;color:var(--amber)">📡 Moving</div>':''}
      <button class="wave-btn${waveSentSet.has(p.id)?' sent':''}" onclick="event.stopPropagation();waveToId(${p.id},this)">${waveSentSet.has(p.id)?'✅':'👋'}</button>
    </div>
  </div>`).join('');
}
function buildMatches(){
  const sorted=[...people].sort((a,b)=>b.match-a.match);
  document.getElementById('match-list').innerHTML=sorted.map(p=>`<div class="match-card" onclick="openModal(${p.id})">
    <div class="m-av" style="background:${p.bg}; display:flex; align-items:center; justify-content:center; overflow:hidden; color:#fff; font-weight:bold; font-family:'Space Grotesk',sans-serif;">
      ${p.photoUrl?`<img src="${p.photoUrl}" style="width:100%;height:100%;object-fit:cover">`:`${p.initial || '👤'}`}
    </div>
    <div class="m-body"><div class="m-name">${p.name}, ${p.age}</div><div class="m-sub">${p.interests.join(' · ')}</div>
      <div class="m-bar-wrap"><div class="m-bar"><div class="m-bar-fill" style="width:${p.match}%"></div></div><div class="m-pct">${p.match}%</div></div>
      <div style="font-size:10px;color:${p.status==='live'?'var(--green)':'var(--amber)'};margin-top:5px;display:flex;align-items:center;gap:3px">
        <span style="width:5px;height:5px;border-radius:50%;background:${p.status==='live'?'var(--green)':'var(--amber)'};display:inline-block"></span>
        ${p.status==='live'?'Live · '+p.dist+' away':fmtLast(p.lastSeen)||'Away'}
      </div>
    </div>
    <div class="msg-ico" onclick="event.stopPropagation();openChatWith('${p.name}')"><i class="ti ti-message"></i></div>
  </div>`).join('');
}
function buildChats(){
  document.getElementById('chat-list').innerHTML=chatsData.map((c,i)=>{
    const person=people.find(p=>p.name===c.name);
    return`<div class="chat-item${currentChatIdx===i?' active':''}" onclick="openChat(${i})">
      <div class="ch-av">${person?.photoUrl?`<img src="${person.photoUrl}" style="width:100%;height:100%;object-fit:cover">`:`${c.emoji}`}<div class="ch-av-dot" style="background:${c.online?'var(--green)':'#444'}"></div></div>
      <div class="ch-info"><div class="ch-name">${c.name}</div><div class="ch-preview">${c.msgs.slice(-1)[0]?.type==='voice'?'🎙️ Voice note':c.preview}</div></div>
      <div class="ch-meta"><div class="ch-time">${c.time}</div>${c.unread?`<div class="ch-unread">${c.unread}</div>`:''}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════════
function renderMsgHtml(m){
  if(m.type==='voice'){
    const bars=Array.from({length:20},()=>{const h=4+Math.random()*20;return`<div class="vn-bar" style="height:${h}px"></div>`}).join('');
    return`<div class="voice-note ${m.me?'me':'them'}">
      <button class="vn-play" onclick="playVoiceNote('${m.audioUrl||''}',this)"><i class="ti ti-player-play-filled" style="font-size:12px"></i></button>
      <div class="vn-waveform">${bars}</div>
      <div class="vn-dur">0:${String(m.duration||3).padStart(2,'0')}</div>
    </div>`;
  }
  if(m.type==='image'){
    return`<div class="msg-image${m.me?'':''}" style="align-self:${m.me?'flex-end':'flex-start'}" onclick="openImgViewer('${m.src}')">
      <img src="${m.src}" style="max-width:240px;border-radius:12px;display:block">
    </div>`;
  }
  if(m.type==='video'){
    return`<div class="msg-video" style="align-self:${m.me?'flex-end':'flex-start'}">
      <video src="${m.src}" controls style="max-width:240px;border-radius:12px;display:block"></video>
    </div>`;
  }
  if(m.type==='file'){
    return`<div class="msg-file" style="align-self:${m.me?'flex-end':'flex-start'};background:${m.me?'rgba(240,67,106,.2)':'var(--dark4)'}">
      <div class="msg-file-icon">📄</div>
      <div class="msg-file-info"><div class="msg-file-name">${m.filename}</div><div class="msg-file-size">${m.filesize}</div></div>
      <i class="ti ti-download" style="font-size:16px;color:var(--muted2)"></i>
    </div>`;
  }
  return`<div class="msg ${m.me?'me':'them'}"${m.ai?' style="border-left:2px solid rgba(182,155,255,.4)"':''}>
    ${m.ai?'<div class="ai-label">✦ AI</div>':''}${m.text}
  </div>`;
}

async function openChat(i) {
  currentChatIdx = i;
  const c = chatsData[i];
  c.unread = 0;
  buildChats();
  updateBadge();
  
  const token = localStorage.getItem('token');
  const otherUserId = c.other_id;
  
  try {
    const response = await fetch(`${API_URL}/api/messages?token=${token}&other_user_id=${otherUserId}`);
    if (response.ok) {
      const result = await response.json();
      c.msgs = result.messages.map(m => {
        const isMe = parseInt(m.sender_id) === JSON.parse(localStorage.getItem('currentUser')).id;
        let msgType = "text";
        if (m.media_type === "voice") msgType = "voice";
        else if (m.media_type === "photo" || m.media_type === "image") msgType = "image";
        else if (m.media_type === "video") msgType = "video";
        
        const now = new Date(m.created_at);
        const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        return {
          me: isMe,
          type: msgType,
          text: m.message_text,
          audioUrl: m.media_url ? (m.media_url.startsWith('/uploads') ? API_URL + m.media_url : m.media_url) : null,
          duration: m.voice_duration,
          src: m.media_url ? (m.media_url.startsWith('/uploads') ? API_URL + m.media_url : m.media_url) : null,
          time: t
        };
      });
    }
  } catch (err) {
    console.error("Failed to load message history:", err);
  }

  const person = people.find(p => p.id === c.other_id);
  const dist = person ? person.dist : 'nearby';
  const main = document.getElementById('chat-main');
  main.innerHTML = `
    <div class="chat-topbar">
      <button class="icon-btn mobile-back-btn" onclick="backToChatList()" style="margin-right:8px; display:none"><i class="ti ti-arrow-left"></i></button>
      <div style="width:38px;height:38px;border-radius:50%;font-size:17px;display:flex;align-items:center;justify-content:center;background:var(--dark4);position:relative;flex-shrink:0;overflow:hidden">
        ${person?.photoUrl ? `<img src="${person.photoUrl}" style="width:100%;height:100%;object-fit:cover">` : `${c.emoji}`}
        <div style="position:absolute;bottom:1px;right:1px;width:9px;height:9px;border-radius:50%;background:${c.online ? 'var(--green)' : '#444'};border:2px solid var(--dark2)"></div>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:14px;font-family:'Space Grotesk',sans-serif">${c.name}</div>
        <div style="font-size:11px;color:${c.online ? 'var(--green)' : 'var(--muted2)'};display:flex;align-items:center;gap:5px">
          ${c.online ? '<span>● Online</span>' : `<span>Offline · Last seen ${c.lastSeen || 'recently'}</span>`}
          <span style="color:var(--muted)">·</span><span style="color:var(--muted)">${dist} away</span>
        </div>
      </div>
      <div class="icon-btn" onclick="startCall('voice', '${c.name}', '${c.photoUrl || ''}')"><i class="ti ti-phone"></i></div>
      <div class="icon-btn" onclick="startCall('video', '${c.name}', '${c.photoUrl || ''}')"><i class="ti ti-video"></i></div>
    </div>
    <div class="chat-messages" id="msgs">
      ${c.msgs.map(m => `<div class="msg-wrap">${renderMsgHtml(m)}<div class="msg-time ${m.me ? 'right' : 'left'}">${m.time || ''}${m.me && m.time ? ` <span style="color:var(--blue)">✓✓</span>` : ''}</div></div>`).join('')}
    </div>
    <div id="chat-input-area">
      <div class="chat-input-row">
        <div class="attach-btn" id="attach-btn" onclick="toggleAttachMenu()" title="Attach">
          <i class="ti ti-paperclip"></i>
          <div class="attach-menu" id="attach-menu">
            <div class="attach-menu-item" onclick="triggerChatMedia('image/*')"><i class="ti ti-photo" style="color:var(--blue)"></i>Photo</div>
            <div class="attach-menu-item" onclick="triggerChatMedia('video/*')"><i class="ti ti-video" style="color:var(--red)"></i>Video</div>
            <div class="attach-menu-item" onclick="triggerChatMedia('*/*')"><i class="ti ti-file" style="color:var(--amber)"></i>File</div>
            <div class="attach-menu-item" onclick="triggerChatMedia('image/*');toast('📷 Camera — use your files')"><i class="ti ti-camera" style="color:var(--green)"></i>Camera</div>
          </div>
        </div>
        <input type="file" id="chat-media-input" style="display:none" onchange="onChatMediaChange(this,${i})">
        <textarea class="chat-input" id="chat-inp" placeholder="Type a message…" rows="1" oninput="autoResize(this)" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMsg(${i})}"></textarea>
        <div class="voice-hold-btn" id="voice-btn" title="Hold to record" onmousedown="startRecording(${i})" onmouseup="stopRecording(${i})" ontouchstart="startRecording(${i})" ontouchend="stopRecording(${i})"><i class="ti ti-microphone"></i></div>
        <button class="send-btn" onclick="sendMsg(${i})"><i class="ti ti-send"></i></button>
      </div>
    </div>`;
  setTimeout(() => { const m = document.getElementById('msgs'); if (m) m.scrollTop = 99999 }, 50);
  document.addEventListener('click', closeAttachMenuOutside);

  const listPanel = document.getElementById('chat-list-panel');
  const chatMain = document.getElementById('chat-main');
  if (listPanel) listPanel.classList.add('hide-mobile');
  if (chatMain) chatMain.classList.add('active');
}
function toggleAttachMenu(){const m=document.getElementById('attach-menu');if(m)m.classList.toggle('show')}
function closeAttachMenuOutside(e){const btn=document.getElementById('attach-btn');const menu=document.getElementById('attach-menu');if(menu&&!btn?.contains(e.target)){menu.classList.remove('show')}}
function triggerChatMedia(accept){const inp=document.getElementById('chat-media-input');if(inp){inp.accept=accept;inp.click()}}
function onChatMediaChange(input,chatIdx){
  const file = input.files[0];
  if (!file) return;
  
  const token = localStorage.getItem('token');
  const chat = chatsData[chatIdx];
  
  const formData = new FormData();
  formData.append('token', token);
  formData.append('file', file);
  
  toast('📤 Uploading attachment...');
  fetch(`${API_URL}/api/messages/upload`, {
    method: 'POST',
    body: formData
  })
  .then(res => {
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  })
  .then(result => {
    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
      chatSocket.send(JSON.stringify({
        type: "chat",
        to: chat.other_id,
        message: "",
        media_url: result.media_url,
        media_type: result.media_type
      }));
      
      const now = new Date();
      const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      
      let msgType = "file";
      if (result.media_type === "photo") msgType = "image";
      else if (result.media_type === "video") msgType = "video";
      else if (result.media_type === "voice") msgType = "voice";
      
      const fullMediaUrl = result.media_url.startsWith('/uploads') ? API_URL + result.media_url : result.media_url;
      
      const msg = {
        me: true,
        type: msgType,
        src: fullMediaUrl,
        audioUrl: msgType === 'voice' ? fullMediaUrl : null,
        filename: file.name,
        filesize: file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)}MB` : `${Math.round(file.size / 1024)}KB`,
        time: t
      };
      
      chat.msgs.push(msg);
      chat.preview = result.media_type === "photo" ? "📷 Photo" : result.media_type === "video" ? "🎬 Video" : `📄 ${file.name}`;
      chat.time = "now";
      
      openChat(chatIdx);
      buildChats();
      toast('✅ Attachment sent!');
    } else {
      toast('🔴 WebSocket offline, cannot send');
    }
  })
  .catch(err => {
    console.error(err);
    toast('❌ Attachment upload failed');
  });
}
function autoResize(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,100)+'px'}
function toggleAIInChat(){aiEnabled=!aiEnabled;const btn=document.getElementById('chat-ai-btn');if(btn){btn.classList.toggle('on',aiEnabled);btn.innerHTML=`<i class="ti ti-sparkles"></i>${aiEnabled?'<div class="ai-dot">AI</div>':''}`}toast(aiEnabled?'🤖 AI replies ON':'🔴 AI replies OFF')}

// ── VOICE RECORDING ──
function playVoiceNote(url,btn){
  if(!url){toast('🎙️ Simulated voice note');return}
  const audio=new Audio(url);audio.play();btn.innerHTML='<i class="ti ti-player-stop-filled" style="font-size:12px"></i>';audio.onended=()=>{btn.innerHTML='<i class="ti ti-player-play-filled" style="font-size:12px"></i>'}
}
async function startRecording(chatIdx){
  if(isRecording)return;
  try{
    recStream=await navigator.mediaDevices.getUserMedia({audio:true});
    audioChunks=[];
    mediaRecorder=new MediaRecorder(recStream);
    mediaRecorder.ondataavailable=e=>audioChunks.push(e.data);
    mediaRecorder.onstop=()=>{
      const blob=new Blob(audioChunks,{type:'audio/webm'});
      sendVoiceNoteMsg(chatIdx,blob,recordingDuration);
      recStream.getTracks().forEach(t=>t.stop());
    };
    mediaRecorder.start();isRecording=true;recordingDuration=0;
    const vBtn=document.getElementById('voice-btn');if(vBtn)vBtn.classList.add('recording');
    recInterval=setInterval(()=>{recordingDuration++;showRecordingUI()},1000);
    showRecordingUI();
  }catch(e){
    toast('🎙️ Mic access denied — sending simulated voice note');
    isRecording=true;recordingDuration=0;
    const vBtn=document.getElementById('voice-btn');if(vBtn)vBtn.classList.add('recording');
    recInterval=setInterval(()=>{recordingDuration++;showRecordingUI()},1000);
    showRecordingUI();
    setTimeout(()=>stopRecording(chatIdx,true),0);
  }
}
function stopRecording(chatIdx,simulated=false){
  if(!isRecording)return;isRecording=false;clearInterval(recInterval);
  const vBtn=document.getElementById('voice-btn');if(vBtn)vBtn.classList.remove('recording');
  removeRecordingUI();
  if(simulated||!mediaRecorder){sendVoiceNoteMsg(chatIdx,null,recordingDuration||2)}
  else if(mediaRecorder&&mediaRecorder.state!=='inactive'){mediaRecorder.stop()}
}
async function sendVoiceNoteMsg(chatIdx,blob,dur){
  const token = localStorage.getItem('token');
  const chat = chatsData[chatIdx];
  
  let targetBlob = blob;
  if (!targetBlob) {
    targetBlob = new Blob([new Uint8Array(100)], { type: 'audio/webm' });
  }
  
  const file = new File([targetBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
  const formData = new FormData();
  formData.append('token', token);
  formData.append('file', file);
  
  toast('📤 Uploading voice note...');
  try {
    const res = await fetch(`${API_URL}/api/messages/upload`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('Voice note upload failed');
    const result = await res.json();
    
    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
      chatSocket.send(JSON.stringify({
        type: "chat",
        to: chat.other_id,
        message: "",
        media_url: result.media_url,
        media_type: "voice",
        voice_duration: dur
      }));
      
      const now = new Date();
      const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const fullMediaUrl = result.media_url.startsWith('/uploads') ? API_URL + result.media_url : result.media_url;
      
      chat.msgs.push({
        me: true,
        type: 'voice',
        audioUrl: fullMediaUrl,
        duration: Math.max(1, dur),
        time: t
      });
      chat.preview = '🎙️ Voice note';
      chat.time = 'now';
      
      openChat(chatIdx);
      buildChats();
      toast('🎙️ Voice note sent!');
    } else {
      toast('🔴 WebSocket offline, cannot send');
    }
  } catch (err) {
    console.error(err);
    toast('❌ Voice note upload failed');
  }
}
function showRecordingUI(){
  const area=document.getElementById('chat-input-area');if(!area)return;
  const dur=recordingDuration;const s=dur%60,m=Math.floor(dur/60);const ts=`${m}:${String(s).padStart(2,'0')}`;
  const bars=Array.from({length:30},()=>{const h=4+Math.floor(Math.random()*24);return`<div style="width:3px;height:${h}px;border-radius:2px;background:var(--red);opacity:.7;flex-shrink:0"></div>`}).join('');
  const recBar=document.getElementById('rec-bar');
  if(!recBar){
    const bar=document.createElement('div');bar.id='rec-bar';bar.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 16px;background:rgba(255,71,87,.08);border-top:1px solid rgba(255,71,87,.2);flex-shrink:0';
    bar.innerHTML=`<div style="width:10px;height:10px;border-radius:50%;background:var(--red);animation:blink .8s infinite;flex-shrink:0"></div>
      <div style="flex:1;display:flex;gap:2px;align-items:center;height:30px;overflow:hidden">${bars}</div>
      <div id="rec-timer" style="font-size:13px;font-weight:700;color:var(--red);font-family:'Space Grotesk',sans-serif;min-width:36px">${ts}</div>`;
    area.insertBefore(bar,area.firstChild);
  }else{const t=document.getElementById('rec-timer');if(t)t.textContent=ts;const wf=recBar.querySelector('div:nth-child(2)');if(wf)wf.innerHTML=bars}
}
function removeRecordingUI(){const bar=document.getElementById('rec-bar');if(bar)bar.remove()}

async function sendMsg(i) {
  const inp = document.getElementById('chat-inp');
  const txt = inp.value.trim();
  if (!txt) return;
  
  const chat = chatsData[i];
  const now = new Date();
  const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
    chatSocket.send(JSON.stringify({
      type: "chat",
      to: chat.other_id,
      message: txt,
      media_type: "text"
    }));
  } else {
    toast("🔴 Chat offline, reconnecting...");
    return;
  }
  
  chat.msgs.push({ me: true, text: txt, time: t });
  chat.preview = txt;
  chat.time = 'now';
  
  inp.value = '';
  inp.style.height = 'auto';
  
  const msgsArea = document.getElementById('msgs');
  if (msgsArea) {
    const wrap = document.createElement('div');
    wrap.className = 'msg-wrap';
    wrap.innerHTML = `${renderMsgHtml({ me: true, text: txt })}<div class="msg-time right">${t} <span style="color:var(--blue)">✓✓</span></div>`;
    msgsArea.appendChild(wrap);
    msgsArea.scrollTop = msgsArea.scrollHeight;
  }
  
  buildChats();

  // If it's a mock user, trigger simulated typing indicator and AI response
  const isMockUser = [1, 2, 3, 4, 5, 6].includes(chat.other_id) || ['Sarah', 'Jason', 'Priya', 'Vikram', 'Divya'].includes(chat.name);
  if (isMockUser && aiEnabled) {
    const person = people.find(p => p.id === chat.other_id) || {
      name: chat.name,
      emoji: chat.emoji || '👤',
      age: 22,
      interests: ['🎵 Music', '🍕 Food'],
      bio: 'Living life near you'
    };
    
    setTimeout(() => {
      // Show typing indicator
      const currentMsgsArea = document.getElementById('msgs');
      if (currentMsgsArea && currentChatIdx === i) {
        const typingDiv = document.createElement('div');
        typingDiv.id = 'typing-indicator';
        typingDiv.className = 'msg-wrap';
        typingDiv.style.alignSelf = 'flex-start';
        typingDiv.style.marginBottom = '10px';
        typingDiv.innerHTML = `
          <div class="msg them" style="display:flex;gap:4px;align-items:center;padding:10px 14px;border-radius:16px;">
            <span class="typing-dot" style="width:6px;height:6px;background:var(--muted2);border-radius:50%;display:inline-block;animation:blink-dot 1.4s infinite"></span>
            <span class="typing-dot" style="width:6px;height:6px;background:var(--muted2);border-radius:50%;display:inline-block;animation:blink-dot 1.4s infinite .2s"></span>
            <span class="typing-dot" style="width:6px;height:6px;background:var(--muted2);border-radius:50%;display:inline-block;animation:blink-dot 1.4s infinite .4s"></span>
          </div>
        `;
        
        if (!document.getElementById('typing-style')) {
          const s = document.createElement('style');
          s.id = 'typing-style';
          s.textContent = '@keyframes blink-dot{0%,100%{opacity:.2}50%{opacity:1}}';
          document.head.appendChild(s);
        }
        
        currentMsgsArea.appendChild(typingDiv);
        currentMsgsArea.scrollTop = currentMsgsArea.scrollHeight;
      }
      
      // Get AI reply
      setTimeout(async () => {
        // Remove typing indicator
        const typingDiv = document.getElementById('typing-indicator');
        if (typingDiv) typingDiv.remove();
        
        const history = chat.msgs.map(m => ({
          role: m.me ? 'user' : 'assistant',
          content: m.text || ''
        }));
        
        const replyText = await getAIReply(person, history, txt);
        const replyTime = new Date();
        const replyT = `${String(replyTime.getHours()).padStart(2, '0')}:${String(replyTime.getMinutes()).padStart(2, '0')}`;
        
        // Add reply to state
        chat.msgs.push({ me: false, text: replyText, time: replyT, ai: true });
        chat.preview = replyText;
        chat.time = 'now';
        
        // If still viewing this chat, render it
        if (currentChatIdx === i) {
          const msgsArea2 = document.getElementById('msgs');
          if (msgsArea2) {
            const wrap = document.createElement('div');
            wrap.className = 'msg-wrap';
            wrap.innerHTML = `${renderMsgHtml({ me: false, text: replyText, ai: true })}<div class="msg-time left">${replyT}</div>`;
            msgsArea2.appendChild(wrap);
            msgsArea2.scrollTop = msgsArea2.scrollHeight;
          }
          // Silent API call to mark read
          fetch(`${API_URL}/api/messages?token=${localStorage.getItem('token')}&other_user_id=${chat.other_id}`);
        } else {
          chat.unread = (chat.unread || 0) + 1;
          showNotif(chat.emoji || '👤', chat.name, replyText, person.photoUrl);
        }
        buildChats();
        updateBadge();
      }, 1500);
    }, 600);
  }
}
function openChatWith(name) {
  showPage('chats');
  let i = chatsData.findIndex(c => c.name === name);
  if (i === -1) {
    const person = people.find(p => p.name === name);
    if (person) {
      chatsData.push({
        other_id: person.id,
        name: person.name,
        emoji: person.emoji,
        online: person.isOnline !== undefined ? person.isOnline : person.status === 'live',
        lastSeen: person.lastSeen || 'recently',
        msgs: [],
        history: [],
        preview: 'New conversation',
        time: 'now',
        unread: 0
      });
      i = chatsData.length - 1;
      buildChats();
    } else {
      toast(`💬 Cannot find ${name}`);
      return;
    }
  }
  setTimeout(() => openChat(i), 80);
}

// ═══════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════
function openModal(id) {
  currentModalPerson = people.find(x => x.id === id);
  const p = currentModalPerson;
  
  // Set Avatar
  const avEl = document.getElementById('u-prof-av');
  avEl.style.background = p.bg;
  if(p.photoUrl) {
    avEl.innerHTML = `<img src="${p.photoUrl}" style="width:100%;height:100%;object-fit:cover">`;
  } else {
    avEl.innerHTML = `<span style="font-size:36px">${p.emoji}</span>`;
  }
  
  // Set Stats (No dummy data)
  document.getElementById('u-prof-posts').textContent = '0';
  document.getElementById('u-prof-followers').textContent = '0';
  document.getElementById('u-prof-following').textContent = '0';
  
  // Set Bio info
  document.getElementById('u-prof-name').textContent = `${p.name}, ${p.age}`;
  document.getElementById('u-prof-dist').textContent = p.dist;
  document.getElementById('u-prof-bio').innerHTML = p.bio ? p.bio.replace(/\n/g, '<br/>') : '';
  document.getElementById('u-prof-match').innerHTML = `❤️ ${p.match}% interest match`;
  
  // Set Action Buttons
  document.getElementById('u-prof-msg-btn').onclick = () => { closeUserProfile(); openChatWith(p.name); };
  
  const followBtn = document.getElementById('u-prof-follow-btn');
  if(followBtn) {
    if(followSet.has(p.id)) {
      followBtn.textContent = 'Following';
      followBtn.style.background = 'var(--dark4)';
    } else {
      followBtn.textContent = 'Follow';
      followBtn.style.background = 'var(--blue, #3b82f6)';
    }
    followBtn.onclick = () => {
      let count = parseInt(document.getElementById('u-prof-followers').textContent) || 0;
      if(followSet.has(p.id)) {
        followSet.delete(p.id);
        followBtn.textContent = 'Follow';
        followBtn.style.background = 'var(--blue, #3b82f6)';
        toast(`Removed ${p.name} from followed`);
        document.getElementById('u-prof-followers').textContent = Math.max(0, count - 1);
      } else {
        followSet.add(p.id);
        followBtn.textContent = 'Following';
        followBtn.style.background = 'var(--dark4)';
        toast(`✅ You are now following ${p.name}`);
        document.getElementById('u-prof-followers').textContent = count + 1;
      }
    };
  }
  
  const waveBtn = document.getElementById('u-prof-wave-btn');
  if(waveSentSet.has(p.id)) {
    waveBtn.textContent = '✅ Waved!';
    waveBtn.disabled = true;
  } else {
    waveBtn.textContent = '👋 Wave';
    waveBtn.disabled = false;
    waveBtn.onclick = () => { sendWave(); waveBtn.textContent = '✅ Waved!'; waveBtn.disabled = true; };
  }
  
  // Story Highlight
  const highlights = document.getElementById('u-prof-highlights');
  if(p.stories && p.stories.length > 0) {
    highlights.style.display = 'flex';
    document.getElementById('u-prof-story-btn').onclick = () => { openStory(p.id); };
    const storyInner = document.getElementById('u-prof-story-inner');
    if(p.photoUrl) storyInner.innerHTML = `<img src="${p.photoUrl}" style="width:100%;height:100%;object-fit:cover">`;
    else storyInner.innerHTML = `<span style="font-size:24px">${p.emoji}</span>`;
  } else {
    highlights.style.display = 'none';
  }

  // Populate Fake Grid
  const grid = document.getElementById('u-prof-grid');
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--muted)">No posts yet</div>';
  
  // Show the page
  showPage('user-profile');
}
function closeModal(){document.getElementById('modal').classList.remove('open')}
function sendWave(){if(!currentModalPerson)return;waveSentSet.add(currentModalPerson.id);const wbtn=document.getElementById('u-prof-wave-btn');if(wbtn){wbtn.textContent='✅ Waved!';wbtn.disabled=true;}toast(`👋 Wave sent to ${currentModalPerson.name}!`);addActivity(currentModalPerson,'received a wave','Waiting for reply','👋');const ci=chatsData.findIndex(c=>c.name===currentModalPerson.name);if(ci>=0){const now=new Date();const t=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;chatsData[ci].msgs.push({me:true,text:'👋 Hey there!',time:t});chatsData[ci].preview='👋 Hey there!';chatsData[ci].time='now';buildChats()}}
function waveToId(id,btn){const p=people.find(x=>x.id===id);if(!p||waveSentSet.has(id))return;waveSentSet.add(id);btn.classList.add('sent');btn.textContent='✅';toast(`👋 Wave sent to ${p.name}!`)}

// ═══════════════════════════════════════════════════
// PAGES
// ═══════════════════════════════════════════════════
const pages=['discover','feed','nearby','matches','chats','profile','user-profile','admin'];
const pageTitles={discover:'Discover',feed:'Feed',nearby:'Nearby Map',matches:'Matches',chats:'Messages',profile:'My Profile','user-profile':'Profile',admin:'Admin Panel'};
function showPage(name){
  pages.forEach(n=>{const pg=document.getElementById('page-'+n);if(pg){pg.style.display='none';pg.classList.remove('active')}document.getElementById('nav-'+n)?.classList.remove('active');document.getElementById('mob-'+n)?.classList.remove('active')});
  const pg=document.getElementById('page-'+name);
  pg.style.display=(name==='nearby'||name==='chats')?'block':'flex';
  if(name==='nearby'){pg.style.overflow='hidden';pg.style.height='100%'}
  if(name==='chats'){pg.style.overflow='hidden';pg.style.height='100%'}
  pg.classList.add('active');
  document.getElementById('page-title').textContent=pageTitles[name];
  document.getElementById('nav-'+name)?.classList.add('active');
  document.getElementById('mob-'+name)?.classList.add('active');
  if(name==='nearby')setTimeout(initLeafletMap,80);
  if(name==='feed'){buildFeed();document.getElementById('feed-badge').style.display='none'}
  if(name==='admin')loadAdminData();

  if (name === 'chats') {
    const listPanel = document.getElementById('chat-list-panel');
    const chatMain = document.getElementById('chat-main');
    if (currentChatIdx !== null && currentChatIdx !== undefined) {
      if (listPanel) listPanel.classList.add('hide-mobile');
      if (chatMain) chatMain.classList.add('active');
    } else {
      if (listPanel) listPanel.classList.remove('hide-mobile');
      if (chatMain) chatMain.classList.remove('active');
    }
  }
}

function backToChatList() {
  currentChatIdx = null;
  const listPanel = document.getElementById('chat-list-panel');
  const chatMain = document.getElementById('chat-main');
  if (listPanel) listPanel.classList.remove('hide-mobile');
  if (chatMain) {
    chatMain.classList.remove('active');
    chatMain.innerHTML = `<div class="chat-empty"><i class="ti ti-messages"></i><p>Select a conversation</p></div>`;
  }
  buildChats();
}
function filterCards(q){const f=q.toLowerCase().trim();if(!f){buildCards(filterByKey((document.querySelector('.chip.on')||{dataset:{key:'all'}}).dataset.key));return}buildCards(people.filter(p=>p.name.toLowerCase().includes(f)||p.interests.some(i=>i.toLowerCase().includes(f))||p.bio?.toLowerCase().includes(f)))}
function toggleChip(el,key){document.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));el.classList.add('on');document.getElementById('search-input').value='';buildCards(filterByKey(key))}

// ═══════════════════════════════════════════════════
// TOAST & NOTIF
// ═══════════════════════════════════════════════════
function toast(msg){const c=document.getElementById('toast-container');const t=document.createElement('div');t.className='toast';t.textContent=msg;c.appendChild(t);setTimeout(()=>{t.style.animation='toastOut .25s ease forwards';setTimeout(()=>t.remove(),250)},3000)}
let notifTimer;
function showNotif(emoji,title,sub,photoUrl){
  const el=document.getElementById('notif-popup');const tog=document.getElementById('toggle-notifs');if(tog&&!tog.classList.contains('on'))return;
  const av=document.getElementById('notif-av');av.innerHTML=photoUrl?`<img src="${photoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:`${emoji}`;
  document.getElementById('notif-title').textContent=title;document.getElementById('notif-sub').textContent=sub;el.classList.add('show');clearTimeout(notifTimer);notifTimer=setTimeout(()=>el.classList.remove('show'),4000);
}
function showNotifDemo(){const r=people[Math.floor(Math.random()*people.length)];showNotif(r.emoji,`${r.name} is ${Math.round(Math.random()*300+80)}m away!`,`${r.interests[0]} · ${r.match}% match`,r.photoUrl)}
function onToggleLoc(el){if(el.classList.contains('on')){startGPS();toast('📍 Live location ON')}else{if(locWatchId!=null){navigator.geolocation.clearWatch(locWatchId);locWatchId=null}toast('📍 Location OFF')}}

// ═══════════════════════════════════════════════════
// LEAFLET MAP
// ═══════════════════════════════════════════════════
let leafletMap=null,youMarker=null,peoplePins={};
function initLeafletMap(){
  if(leafletMap){leafletMap.invalidateSize();return}
  const darkMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19});
  const googleHybrid = L.tileLayer('http://{s}.google.com/vt/lyrs=y,m&x={x}&y={y}&z={z}',{maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3']});
  const googleTerrain = L.tileLayer('http://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',{maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3']});
  const googleStreets = L.tileLayer('http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',{maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3']});
  leafletMap=L.map('leaflet-map',{zoomControl:true,attributionControl:false, layers:[googleHybrid]}).setView([myLat,myLng],14);
  L.control.layers({"Google Hybrid (3D)": googleHybrid, "Google Terrain": googleTerrain, "Google Streets": googleStreets, "Dark Map": darkMap}).addTo(leafletMap);
  if(!document.getElementById('map-css')){const s=document.createElement('style');s.id='map-css';s.textContent=`@keyframes pulseRing{0%{transform:scale(.5);opacity:.8}100%{transform:scale(3);opacity:0}}.leaflet-popup-content-wrapper{background:rgba(14,14,26,.97)!important;border:1px solid rgba(255,255,255,.1)!important;border-radius:12px!important;color:#eef0fb!important;box-shadow:0 8px 30px rgba(0,0,0,.6)!important}.leaflet-popup-tip{background:rgba(14,14,26,.97)!important}`;document.head.appendChild(s)}
  const youIcon=L.divIcon({className:'',html:`<div style="position:relative;width:36px;height:36px"><div style="position:absolute;inset:-10px;border-radius:50%;background:rgba(240,67,106,.2);animation:pulseRing 2s ease-out infinite"></div><div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#f0436a,#c44aff);border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 3px 14px rgba(240,67,106,.7);overflow:hidden">${myPhotoUrl?`<img src="${myPhotoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:'😎'}</div></div>`,iconSize:[36,36],iconAnchor:[18,18]});
  youMarker=L.marker([myLat,myLng],{icon:youIcon}).addTo(leafletMap).bindPopup('<b style="color:#f0436a">📍 You</b><br><span style="color:#888;font-size:11px">Live · Your location</span>');
  
  redrawMapMarkers();
  document.getElementById('map-loc-label').textContent='📍 Chennai, Tamil Nadu';
}
function redrawMapMarkers() {
  if (!leafletMap) return;
  
  // Clear all existing pins
  for (const id in peoplePins) {
    leafletMap.removeLayer(peoplePins[id]);
  }
  peoplePins = {};

  people.forEach(p => {
    const statusColor = p.status === 'live' ? '#19f090' : '#f5a623';
    const initial = p.name ? p.name.charAt(0).toUpperCase() : '👤';
    const icon = L.divIcon({
      className: '',
      html: `<div style="display:flex; flex-direction:column; align-items:center;">
        <div style="width:36px; height:36px; border-radius:50%; background:${p.bg}; border:3px solid ${statusColor}; display:flex; align-items:center; justify-content:center; font-size:15px; box-shadow:0 3px 10px ${statusColor}55; overflow:hidden;">
          ${p.photoUrl ? `<img src="${p.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` : `<span style="color:#fff; font-weight:bold; font-family:'Space Grotesk',sans-serif;">${initial}</span>`}
        </div>
        <div style="background:rgba(7,7,15,.92); color:${statusColor}; font-size:9px; font-weight:700; border-radius:5px; padding:2px 5px; margin-top:2px; white-space:nowrap; border:1px solid ${statusColor}44;">${p.name.split(' ')[0]}</div>
      </div>`,
      iconSize: [80, 52],
      iconAnchor: [40, 52]
    });
    
    const m = L.marker([p.lat, p.lng], { icon })
      .addTo(leafletMap)
      .bindPopup(`<div style="text-align:center; min-width:140px; padding:4px;">
        <div style="font-size:26px;">${p.photoUrl ? '' : '👤'}</div>
        <b style="color:${statusColor}; font-size:14px;">${p.name}</b><br>
        <span style="color:${statusColor}; font-size:11px;">● ${p.status === 'live' ? 'Live' : 'Away'}</span><br>
        <span style="color:#888; font-size:11px;">📍 ${p.dist}</span><br>
        <button onclick="openModal(${p.id})" style="margin-top:7px; background:${statusColor}; border:none; border-radius:8px; padding:5px 14px; color:#fff; font-size:12px; font-weight:600; cursor:pointer;">View Profile</button>
      </div>`);
      
    m.on('click', function() { this.openPopup(); });
    peoplePins[p.id] = m;
  });
}
function updateMapPins(){ redrawMapMarkers(); }
// FIX #9: wrapped in DOMContentLoaded to avoid crash before DOM is ready
document.addEventListener('DOMContentLoaded', function() {
document.getElementById('loc-btn').onclick=function(){if(navigator.geolocation){toast('📡 Getting GPS…');navigator.geolocation.getCurrentPosition(pos=>{myLat=pos.coords.latitude;myLng=pos.coords.longitude;updateDistances();updateAllUI();if(leafletMap)leafletMap.setView([myLat,myLng],15);if(youMarker)youMarker.setLatLng([myLat,myLng]);toast(`📍 GPS fix!`)},()=>toast('📍 Using simulated location'))}else toast('📍 GPS not available')};
}); // end DOMContentLoaded for loc-btn

// ═══════════════════════════════════════════════════
// INIT & AUTH
// ═══════════════════════════════════════════════════
document.querySelector('.app').style.display = 'none';

// FIX #10: Restore session if user was previously logged in
(function restoreSession() {
  const saved = localStorage.getItem('currentUser');
  if (saved) {
    try {
      const user = JSON.parse(saved);
      // Defer until DOM & scripts are fully loaded
      window.addEventListener('load', function() { initApp(user); });
    } catch(e) {
      localStorage.removeItem('currentUser');
    }
  }
})();

function initApp(user) {
  document.getElementById('page-auth').style.display = 'none';
  document.querySelector('.app').style.display = 'flex';
  
  if (user) {
    if (user.name) {
      document.querySelector('.hero-name').textContent = user.name;
      document.querySelector('.me-name').textContent = user.name;
    }
    if (user.bio) {
      document.querySelector('.bio-text').textContent = user.bio;
    }
    if (user.location) {
      document.getElementById('profile-loc-text').textContent = user.location;
    }
    if (user.profile_pic) {
      let picUrl = user.profile_pic;
      if (picUrl && picUrl.startsWith('/uploads')) {
        picUrl = API_URL + picUrl;
      }
      myPhotoUrl = picUrl;
      updateMyAvatars();
    }
    
    // Toggle Admin Panel links
    if (user.email === 'pugal@gmail.com') {
      document.getElementById('nav-admin').style.display = 'flex';
      document.getElementById('mob-admin').style.display = 'inline-flex';
    } else {
      document.getElementById('nav-admin').style.display = 'none';
      document.getElementById('mob-admin').style.display = 'none';
    }
  }

  loadApiKey();
  
  if (user && user.id) {
    connectWebSocket(user.id);
  }

  loadNearbyUsers().then(() => {
    loadChatConversations();
    loadFeed();
    loadStories();
  });
  
  startGPS();
  showPage('discover');
}

function switchAuth(type) {
  if (type === 'signup') {
    document.getElementById('auth-login-box').style.display = 'none';
    document.getElementById('auth-signup-box').style.display = 'block';
  } else {
    document.getElementById('auth-signup-box').style.display = 'none';
    document.getElementById('auth-login-box').style.display = 'block';
  }
}

async function handleLogin() {

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value.trim();

    if (!email || !password) {
        alert("Please enter email and password");
        return;
    }

    try {

        const response = await fetch(`${API_URL}/api/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email,
                password
            })
        });

        const result = await response.json();

        if (response.ok) {

            localStorage.setItem(
                "currentUser",
                JSON.stringify(result.user)
            );

            localStorage.setItem(
                "token",
                result.token
            );

            initApp(result.user);

            startLocationTracking();

            loadNearbyUsers();

        } else {

            alert(
                result.detail ||
                "Invalid Email or Password"
            );

        }

    } catch (error) {

        console.error(error);

        alert("Failed to connect to server");

    }
}

async function startLocationTracking() {

    const token = localStorage.getItem("token");

    if (!token) return;

    if (!navigator.geolocation) {
        alert("GPS not supported");
        return;
    }

    navigator.geolocation.watchPosition(

        async (position) => {

            try {

                await fetch(
                    `${API_URL}/api/location`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            token: token,
                            lat: position.coords.latitude,
                            lng: position.coords.longitude
                        })
                    }
                );

            } catch (err) {

                console.error(
                    "Location update failed",
                    err
                );

            }

        },

        (error) => {
            console.error(error);
        },

        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000
        }
    );
}
async function loadNearbyUsers() {
  try {
    // 1. தற்போதைய லாகின் செய்துள்ள பயனர் விவரங்களை டோக்கனுடன் எடுக்கிறோம்
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) return;

    // 2. பிரவுசரின் தற்போதைய லொகேஷனைப் பெற்று அதுவரை காத்திருக்கிறோம் (Promise wrapper)
    if (navigator.geolocation) {
      await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            myLat = position.coords.latitude;
            myLng = position.coords.longitude;
            resolve();
          },
          (error) => {
            console.error("Geolocation error:", error);
            resolve(); // பிழை ஏற்பட்டாலும் அடுத்த கட்டத்திற்குச் செல்ல
          },
          { enableHighAccuracy: false, timeout: 30000, maximumAge: Infinity }
        );
      });
    }

    // 3. சரியான லொகேஷன் மற்றும் பாதுகாப்பான டோக்கனுடன் (Authorization Header) API-ஐ அழைக்கிறோம்
    const response = await fetch(`${API_URL}/api/nearby?lat=${myLat}&lng=${myLng}&radius=${radiusKm}`, {
      headers: {
        'Authorization': `Bearer ${currentUser.token}`
      }
    });

    if (!response.ok) throw new Error("Failed to fetch nearby users from server");

    const data = await response.json();
    console.log("Nearby Users Data:", data);

    if (!data.users) return;
    people.length = 0; // பழைய டேட்டாவை நீக்க

    data.users.forEach(user => {
      // லாகின் செய்துள்ள உங்களைத் தவிர்க்க
      if (String(user.id) === String(currentUser.id)) return;

      // இரண்டு புள்ளிகளுக்கு இடையே உள்ள தூரத்தைக் கணக்கிடுதல்
      const distance = haversineKm(myLat, myLng, parseFloat(user.lat), parseFloat(user.lng));

      let rawPic = user.profile_pic || user.avatar || null;
      if (rawPic && rawPic.startsWith('/uploads')) {
        rawPic = API_URL + rawPic;
      }

      const bgGradients = [
        'linear-gradient(135deg, #f0436a, #c44aff)',
        'linear-gradient(135deg, #3b82f6, #8b5cf6)',
        'linear-gradient(135deg, #10b981, #3b82f6)',
        'linear-gradient(135deg, #f59e0b, #ef4444)',
        'linear-gradient(135deg, #ec4899, #f43f5e)'
      ];
      const bg = bgGradients[user.id % bgGradients.length];
      const initial = user.name ? user.name.charAt(0).toUpperCase() : '👤';
      const interestsList = getInterests(user.id);
      const userAge = user.age || (20 + (user.id % 8)); // Deterministic age based on user id

      people.push({
        id: user.id,
        name: user.name,
        bio: user.bio || "Living life near you ✨",
        lat: parseFloat(user.lat),
        lng: parseFloat(user.lng),
        location: user.location || "Nearby",
        avatar: rawPic,
        isOnline: user.isOnline !== undefined ? user.isOnline : (user.status === 'live' || user.status === 'online'),
        lastSeen: user.lastSeen || 'recently',
        dist: `${distance.toFixed(1)} km away`,
        distKm: distance,
        interests: interestsList,
        age: userAge,
        bg: bg,
        initial: initial,
        emoji: '👤',
        match: 70 + (user.id % 26), // Deterministic match percentages
        status: user.isOnline === false ? 'offline' : (user.status || 'live'),
        photoUrl: rawPic,
        dot: '#19f090'
      });
    });

    // 4. Update the UI components
    updateAllUI();

  } catch (err) {
    console.error("Failed to load nearby users based on location:", err);
  }
}
async function handleSignup() {
    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value.trim();
    const location = document.getElementById("signup-location").value.trim();
    const bio = document.getElementById("signup-bio").value.trim();

    if (!name || !email || !password) {
        alert("Please fill all required fields");
        return;
    }

    try {
        const formData = new FormData();
        formData.append("name", name);
        formData.append("email", email);
        formData.append("password", password);
        formData.append("location", location);
        formData.append("bio", bio);
        formData.append("lat", myLat || 13.0827);
        formData.append("lng", myLng || 80.2707);

        const response = await fetch(`${API_URL}/api/signup`, {
            method: "POST",
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            localStorage.setItem("currentUser", JSON.stringify(result.user));
            if (result.token) {
                localStorage.setItem("token", result.token);
            }
            initApp(result.user);
            startLocationTracking();
            loadNearbyUsers();
        } else {
            // If the error detail is an array (FastAPI validation errors), display messages nicely
            if (Array.isArray(result.detail)) {
                const msgs = result.detail.map(err => `${err.loc.join('.')}: ${err.msg}`).join("\n");
                alert(msgs);
            } else {
                alert(result.detail || "Signup Failed");
            }
        }

    } catch (error) {
        console.error(error);
        alert("Failed to connect to the server");
    }
}

function switchInstaTab(tabName, clickedElement) {
  const tabs = document.querySelectorAll('.insta-tab');
  tabs.forEach(t => t.classList.remove('active'));
  clickedElement.classList.add('active');

  const contents = document.querySelectorAll('.insta-tab-content');
  contents.forEach(c => c.classList.remove('active'));
  contents.forEach(c => c.style.display = 'none');
  
  const selectedContent = document.getElementById('tab-' + tabName);
  if (selectedContent) {
    selectedContent.classList.add('active');
    selectedContent.style.display = 'block';
  }
}

// ═══════════════════════════════════════════════════
// EDIT PROFILE
// ═══════════════════════════════════════════════════
function openEditProfile() {
  document.getElementById('edit-profile-modal').classList.add('open');
}

function closeEditProfile() {
  document.getElementById('edit-profile-modal').classList.remove('open');
}

async function saveEditProfile() {
  const name = document.getElementById('edit-name-input').value.trim();
  const bio = document.getElementById('edit-bio-input').value.trim();
  const loc = document.getElementById('edit-loc-input').value.trim();
  const token = localStorage.getItem('token');
  
  if (!name) {
    toast('⚠️ Name is required');
    return;
  }
  
  const formData = new FormData();
  formData.append('token', token);
  formData.append('name', name);
  formData.append('bio', bio);
  formData.append('location', loc);
  
  toast('💾 Saving profile details...');
  try {
    const response = await fetch(`${API_URL}/api/profile`, {
      method: 'POST',
      body: formData
    });
    if (response.ok) {
      const result = await response.json();
      localStorage.setItem('currentUser', JSON.stringify(result.user));
      
      document.querySelector('.hero-name').textContent = result.user.name;
      document.querySelector('.me-name').textContent = result.user.name;
      document.querySelector('.bio-text').textContent = result.user.bio;
      document.getElementById('profile-loc-text').textContent = result.user.location;
      
      closeEditProfile();
      toast('✅ Profile saved and updated in DB!');
    } else {
      const err = await response.json();
      toast(`❌ Failed: ${err.detail || 'error'}`);
    }
  } catch (error) {
    console.error("Profile save error:", error);
    toast('❌ Network error saving profile');
  }
}

function closeUserProfile() {
  showPage('discover');
}

// ═══════════════════════════════════════════════════
// MY PROFILE VIEW MODAL
// ═══════════════════════════════════════════════════
function openMyProfileView() {
  const modal = document.getElementById('my-profile-view-modal');
  if (!modal) return;

  // Populate avatar
  const avEl = document.getElementById('mpv-av');
  if (myPhotoUrl) {
    avEl.innerHTML = `<img src="${myPhotoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    avEl.innerHTML = '😎';
    avEl.style.fontSize = '40px';
  }

  // Populate name
  const nameEl = document.querySelector('#page-profile .hero-name');
  document.getElementById('mpv-name').textContent = nameEl ? nameEl.textContent : 'You';

  // Populate location
  const locEl = document.getElementById('profile-loc-text');
  document.getElementById('mpv-loc').textContent = locEl ? locEl.textContent : 'Chennai';

  // Populate bio
  const bioEl = document.querySelector('#page-profile .bio-text');
  document.getElementById('mpv-bio').textContent = bioEl ? bioEl.innerText : '';

  // Populate stats
  document.getElementById('mpv-posts').textContent = document.getElementById('prof-posts-count')?.textContent || '0';
  document.getElementById('mpv-followers').textContent = document.getElementById('prof-nearby')?.textContent || '0';
  document.getElementById('mpv-following').textContent = document.getElementById('prof-chats')?.textContent || '0';

  modal.classList.add('open');
}

function closeMyProfileView() {
  document.getElementById('my-profile-view-modal')?.classList.remove('open');
}


function toggleSettingsPanel() {
  const panel = document.getElementById('settings-panel');
  const overlay = document.getElementById('settings-overlay');
  const isOpen = panel.classList.contains('open');
  panel.classList.toggle('open', !isOpen);
  overlay.classList.toggle('open', !isOpen);
}

function logoutUser() {
  if (chatSocket) {
    chatSocket.close();
    chatSocket = null;
  }
  localStorage.removeItem('currentUser');
  localStorage.removeItem('nm_my_photo');
  localStorage.removeItem('nm_api_key');
  document.querySelector('.app').style.display = 'none';
  document.getElementById('page-auth').style.display = 'flex';
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  // Close settings panel if open
  const panel = document.getElementById('settings-panel');
  const overlay = document.getElementById('settings-overlay');
  if (panel) panel.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
  switchAuth('login');
  toast('👋 Logged out successfully!');
}
setInterval(() => {

    loadNearbyUsers();

}, 5000);


// ==================================================
// DATABASE DRIVEN REAL-TIME HELPER FUNCTIONS
// ==================================================

function connectWebSocket(userId) {
  if (chatSocket) {
    chatSocket.close();
  }
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const hostUrl = API_URL.replace(/^http/, 'ws');
  chatSocket = new WebSocket(`${hostUrl}/ws/${userId}`);
  
  chatSocket.onopen = () => {
    console.log("✅ WebSocket connected");
  };
  
  chatSocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "blocked") {
        alert("⚠️ Your account has been blocked by an administrator.");
        logoutUser();
        return;
      }
      if (data.type === "chat") {
        receiveWsMessage(data);
      }
    } catch (err) {
      console.error("Error processing websocket message:", err);
    }
  };
  
  chatSocket.onclose = () => {
    console.log("🔴 WebSocket closed. Reconnecting...");
    setTimeout(() => connectWebSocket(userId), 3000);
  };
  
  chatSocket.onerror = (err) => {
    console.error("WebSocket error:", err);
  };
}

function receiveWsMessage(data) {
  const senderId = parseInt(data.from);
  const sender = people.find(p => p.id === senderId);
  const senderName = sender ? sender.name : `User ${senderId}`;
  const senderEmoji = sender ? sender.emoji : '👤';
  
  let chatIdx = chatsData.findIndex(c => c.other_id === senderId);
  if (chatIdx === -1) {
    chatsData.push({
      other_id: senderId,
      name: senderName,
      emoji: senderEmoji,
      online: true,
      lastSeen: 'online',
      msgs: [],
      history: [],
      preview: '',
      time: 'now',
      unread: 0
    });
    chatIdx = chatsData.length - 1;
  }
  
  const now = new Date();
  const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  const isVoice = data.media_type === "voice";
  const isImage = data.media_type === "photo" || data.media_type === "image";
  const isVideo = data.media_type === "video";
  
  let msgType = "text";
  if (isVoice) msgType = "voice";
  else if (isImage) msgType = "image";
  else if (isVideo) msgType = "video";
  
  const msg = {
    me: false,
    type: msgType,
    text: data.message,
    audioUrl: data.media_url ? (data.media_url.startsWith('/uploads') ? API_URL + data.media_url : data.media_url) : null,
    duration: data.voice_duration,
    src: data.media_url ? (data.media_url.startsWith('/uploads') ? API_URL + data.media_url : data.media_url) : null,
    time: t
  };
  
  chatsData[chatIdx].msgs.push(msg);
  chatsData[chatIdx].preview = isVoice ? '🎙️ Voice note' : isImage ? '📷 Photo' : isVideo ? '🎬 Video' : data.message;
  chatsData[chatIdx].time = 'now';
  
  if (currentChatIdx === chatIdx && document.getElementById('page-chats').classList.contains('active')) {
    const msgsArea = document.getElementById('msgs');
    if (msgsArea) {
      const wrap = document.createElement('div');
      wrap.className = 'msg-wrap';
      wrap.innerHTML = `${renderMsgHtml(msg)}<div class="msg-time left">${t}</div>`;
      msgsArea.appendChild(wrap);
      msgsArea.scrollTop = msgsArea.scrollHeight;
    }
    fetch(`${API_URL}/api/messages?token=${localStorage.getItem('token')}&other_user_id=${senderId}`);
  } else {
    chatsData[chatIdx].unread = (chatsData[chatIdx].unread || 0) + 1;
    showNotif(senderEmoji, senderName, msg.text || "Sent you a message", sender ? sender.photoUrl : null);
  }
  
  buildChats();
  updateBadge();
}

async function loadChatConversations() {
  const token = localStorage.getItem('token');
  if (!token) return;
  try {
    const response = await fetch(`${API_URL}/api/chats?token=${token}`);
    if (response.ok) {
      const result = await response.json();
      chatsData.length = 0;
      result.chats.forEach(ch => {
        chatsData.push({
          other_id: ch.id,
          name: ch.name,
          emoji: '👤',
          online: ch.is_online,
          lastSeen: ch.is_online ? 'online' : 'offline',
          msgs: [],
          history: [],
          preview: ch.last_text || 'Conversation',
          time: fmtLastMessageTime(ch.last_time),
          unread: ch.unread_count
        });
      });
      buildChats();
      updateBadge();
    }
  } catch (err) {
    console.error("Failed to load chats:", err);
  }
}

async function loadFeed() {
  try {
    const response = await fetch(`${API_URL}/api/posts?lat=${myLat}&lng=${myLng}&radius=${radiusKm}`);
    if (response.ok) {
      const result = await response.json();
      postsData = result.posts.map(p => {
        let mediaUrl = p.media_url;
        if (mediaUrl && mediaUrl.startsWith('/uploads')) {
          mediaUrl = API_URL + mediaUrl;
        }
        let authorPic = p.author_pic;
        if (authorPic && authorPic.startsWith('/uploads')) {
          authorPic = API_URL + authorPic;
        }
        return {
          id: p.id,
          personId: p.user_id,
          myPost: p.user_id === JSON.parse(localStorage.getItem('currentUser')).id,
          caption: p.caption,
          mediaUrl: mediaUrl,
          mediaType: p.media_type,
          likes: p.likes_count || 0,
          comments: [],
          time: fmtPostTime(p.created_at),
          liked: false,
          bg: 'linear-gradient(135deg,#f0436a,#c44aff)',
          emoji: '👤',
          authorName: p.author_name,
          authorPic: authorPic
        };
      });
      buildFeed();
    }
  } catch (err) {
    console.error("Failed to load feed:", err);
  }
}

async function loadStories() {
  try {
    const response = await fetch(`${API_URL}/api/stories?lat=${myLat}&lng=${myLng}&radius=${radiusKm}`);
    if (response.ok) {
      const result = await response.json();
      
      const grouped = {};
      result.stories.forEach(s => {
        let mediaUrl = s.media_url;
        if (mediaUrl && mediaUrl.startsWith('/uploads')) {
          mediaUrl = API_URL + mediaUrl;
        }
        let authorPic = s.author_pic;
        if (authorPic && authorPic.startsWith('/uploads')) {
          authorPic = API_URL + authorPic;
        }
        
        if (!grouped[s.user_id]) {
          grouped[s.user_id] = {
            id: s.user_id,
            name: s.author_name,
            photoUrl: authorPic,
            emoji: '👤',
            bg: s.bg_color || 'linear-gradient(135deg,#f0436a,#c44aff)',
            stories: []
          };
        }
        grouped[s.user_id].stories.push({
          mediaUrl: mediaUrl,
          mediaType: s.media_type,
          text: s.text,
          bg: s.bg_color,
          time: fmtPostTime(s.created_at)
        });
      });
      
      people.forEach(p => {
        if (grouped[p.id]) {
          p.stories = grouped[p.id].stories;
        } else {
          p.stories = [];
        }
      });
      
      const currentUser = JSON.parse(localStorage.getItem('currentUser'));
      if (currentUser && grouped[currentUser.id]) {
        myStory = grouped[currentUser.id].stories[grouped[currentUser.id].stories.length - 1];
      } else {
        myStory = null;
      }
      
      buildStories();
    }
  } catch (err) {
    console.error("Failed to load stories:", err);
  }
}

function fmtPostTime(ts) {
  if (!ts) return 'just now';
  const d = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function fmtLastMessageTime(ts) {
  if (!ts) return '';
  const now = new Date(ts);
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}


// ==================================================
// SUPER ADMIN DASHBOARD LOGIC
// ==================================================

// ==================================================
// SUPER ADMIN DASHBOARD LOGIC
// ==================================================

function switchAdminTab(tabName) {
  const tabs = ['users', 'posts', 'stories', 'messages'];
  tabs.forEach(t => {
    const btn = document.getElementById('admin-btn-tab-' + t);
    if (btn) {
      if (t === tabName) {
        btn.classList.add('on');
      } else {
        btn.classList.remove('on');
      }
    }
    const section = document.getElementById('admin-section-' + t);
    if (section) {
      section.style.display = (t === tabName) ? 'flex' : 'none';
    }
  });
}

async function loadAdminData() {
  const token = localStorage.getItem('token');
  if (!token) return;

  // 1. Fetch Users List
  try {
    const res = await fetch(`${API_URL}/api/admin/users?token=${token}`);
    if (res.ok) {
      const result = await res.json();
      const userList = document.getElementById('admin-users-list');
      
      document.getElementById('admin-stat-users').textContent = result.users.length;
      document.getElementById('admin-stat-online').textContent = result.users.filter(u => u.is_online).length;

      userList.innerHTML = result.users.map(u => {
        const statusText = u.is_blocked
          ? '<span style="color:var(--red); font-weight:700;">● Blocked</span>'
          : (u.is_online ? '<span style="color:var(--green); font-weight:700;">● Online</span>' : '<span style="color:var(--muted);">● Offline</span>');
        
        let pic = u.profile_pic;
        if (pic && pic.startsWith('/uploads')) {
          pic = API_URL + pic;
        }
        const avatarHtml = pic ? `<img src="${pic}" style="width:28px; height:28px; border-radius:50%; object-fit:cover;">` : `<div style="width:28px; height:28px; border-radius:50%; background:var(--dark4); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:11px;">${(u.name || 'User').charAt(0).toUpperCase()}</div>`;
        
        return `
          <tr style="border-bottom:1px solid var(--border); font-family:'DM Sans',sans-serif;">
            <td style="padding:10px 10px; color:var(--muted); font-weight:600;">#${u.id}</td>
            <td style="padding:10px 10px; display:flex; align-items:center; gap:8px; font-weight:600; color:var(--text);">${avatarHtml} ${u.name}</td>
            <td style="padding:10px 10px; color:var(--muted2);">${u.email}</td>
            <td style="padding:10px 10px; color:var(--muted2);">${u.location || 'Nearby'}</td>
            <td style="padding:10px 10px;">${statusText}</td>
            <td style="padding:10px 10px; text-align:right;">
              <div style="display:flex; justify-content:flex-end; gap:8px;">
                <button onclick="toggleUserOnline(${u.id})" style="background:var(--dark3); border:1px solid var(--border); color:var(--text); border-radius:6px; padding:6px 10px; font-size:11px; cursor:pointer; font-weight:600;" ${u.is_blocked ? 'disabled' : ''}><i class="ti ti-power"></i> Status</button>
                <button onclick="openAdminEditUser(${u.id}, '${escapeHtmlParam(u.name)}', '${escapeHtmlParam(u.email)}', '${escapeHtmlParam(u.bio)}', '${escapeHtmlParam(u.location)}')" style="background:var(--dark3); border:1px solid var(--border); color:var(--text); border-radius:6px; padding:6px 10px; font-size:11px; cursor:pointer; font-weight:600;"><i class="ti ti-edit"></i> Edit</button>
                <button onclick="toggleUserBlock(${u.id})" style="background:${u.is_blocked ? 'rgba(25,240,144,.12)' : 'rgba(255,181,71,.12)'}; border:1px solid ${u.is_blocked ? 'rgba(25,240,144,.2)' : 'rgba(255,181,71,.2)'}; color:${u.is_blocked ? 'var(--green)' : 'var(--amber)'}; border-radius:6px; padding:6px 10px; font-size:11px; cursor:pointer; font-weight:600;"><i class="ti ti-ban"></i> ${u.is_blocked ? 'Unblock' : 'Block'}</button>
                <button onclick="deleteUser(${u.id})" style="background:rgba(255,71,87,.12); border:1px solid rgba(255,71,87,.2); color:var(--red); border-radius:6px; padding:6px 10px; font-size:11px; cursor:pointer; font-weight:600;"><i class="ti ti-trash"></i> Delete</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error("Admin users fetch error:", err);
  }

  // 2. Fetch Posts List
  try {
    const res = await fetch(`${API_URL}/api/admin/posts?token=${token}`);
    if (res.ok) {
      const result = await res.json();
      const postsList = document.getElementById('admin-posts-list');
      
      document.getElementById('admin-stat-posts').textContent = result.posts.length;

      postsList.innerHTML = result.posts.map(p => {
        let mediaUrl = p.media_url;
        if (mediaUrl && mediaUrl.startsWith('/uploads')) {
          mediaUrl = API_URL + mediaUrl;
        }
        const mediaHtml = mediaUrl ? `<a href="${mediaUrl}" target="_blank" style="color:var(--blue); font-weight:600; text-decoration:none;">View Media</a>` : '<span style="color:var(--muted);">Text Only</span>';
        const createdDate = new Date(p.created_at).toLocaleDateString();
        
        return `
          <tr style="border-bottom:1px solid var(--border); font-family:'DM Sans',sans-serif;">
            <td style="padding:10px 10px; color:var(--muted); font-weight:600;">#${p.id}</td>
            <td style="padding:10px 10px; font-weight:600; color:var(--text);">${p.author_name} <br/><span style="font-size:10px; font-weight:normal; color:var(--muted);">${p.author_email}</span></td>
            <td style="padding:10px 10px; color:var(--text); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.caption}</td>
            <td style="padding:10px 10px;">${mediaHtml}</td>
            <td style="padding:10px 10px; color:var(--muted2);">${createdDate}</td>
            <td style="padding:10px 10px; text-align:right;">
              <button onclick="deletePost(${p.id})" style="background:rgba(255,71,87,.12); border:1px solid rgba(255,71,87,.2); color:var(--red); border-radius:6px; padding:6px 10px; font-size:11px; cursor:pointer; font-weight:600;"><i class="ti ti-trash"></i> Delete</button>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error("Admin posts fetch error:", err);
  }

  // 3. Fetch Stories List
  try {
    const res = await fetch(`${API_URL}/api/admin/stories?token=${token}`);
    if (res.ok) {
      const result = await res.json();
      const storiesList = document.getElementById('admin-stories-list');
      
      document.getElementById('admin-stat-stories').textContent = result.stories.length;

      storiesList.innerHTML = result.stories.map(s => {
        let mediaUrl = s.media_url;
        if (mediaUrl && mediaUrl.startsWith('/uploads')) {
          mediaUrl = API_URL + mediaUrl;
        }
        const mediaHtml = mediaUrl ? `<a href="${mediaUrl}" target="_blank" style="color:var(--blue); font-weight:600; text-decoration:none;">View Story (${s.media_type})</a>` : `<span style="background:${s.bg_color || 'var(--dark3)'}; padding:4px 8px; border-radius:4px; font-size:10px;">Gradient BG</span>`;
        const createdDate = new Date(s.created_at).toLocaleString();
        
        return `
          <tr style="border-bottom:1px solid var(--border); font-family:'DM Sans',sans-serif;">
            <td style="padding:10px 10px; color:var(--muted); font-weight:600;">#${s.id}</td>
            <td style="padding:10px 10px; font-weight:600; color:var(--text);">${s.author_name} <br/><span style="font-size:10px; font-weight:normal; color:var(--muted);">${s.author_email}</span></td>
            <td style="padding:10px 10px; color:var(--text); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.text || ''}</td>
            <td style="padding:10px 10px;">${mediaHtml}</td>
            <td style="padding:10px 10px; color:var(--muted2);">${createdDate}</td>
            <td style="padding:10px 10px; text-align:right;">
              <button onclick="deleteAdminStory(${s.id})" style="background:rgba(255,71,87,.12); border:1px solid rgba(255,71,87,.2); color:var(--red); border-radius:6px; padding:6px 10px; font-size:11px; cursor:pointer; font-weight:600;"><i class="ti ti-trash"></i> Delete</button>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error("Admin stories fetch error:", err);
  }

  // 4. Fetch Messages Log
  try {
    const res = await fetch(`${API_URL}/api/admin/messages?token=${token}`);
    if (res.ok) {
      const result = await res.json();
      const messagesList = document.getElementById('admin-messages-list');
      
      document.getElementById('admin-stat-messages').textContent = result.messages.length;

      messagesList.innerHTML = result.messages.map(m => {
        let mediaHtml = '';
        if (m.media_url) {
          let mUrl = m.media_url;
          if (mUrl.startsWith('/uploads')) {
            mUrl = API_URL + mUrl;
          }
          mediaHtml = `<a href="${mUrl}" target="_blank" style="color:var(--blue); font-weight:600; text-decoration:none;">View ${m.media_type}</a>`;
        } else {
          mediaHtml = '<span style="color:var(--muted);">Text Only</span>';
        }
        const createdDate = new Date(m.created_at).toLocaleString();
        
        return `
          <tr style="border-bottom:1px solid var(--border); font-family:'DM Sans',sans-serif;">
            <td style="padding:10px 10px; color:var(--muted); font-weight:600;">#${m.id}</td>
            <td style="padding:10px 10px; font-weight:600; color:var(--text);">${m.sender_name} <br/><span style="font-size:10px; font-weight:normal; color:var(--muted);">${m.sender_email}</span></td>
            <td style="padding:10px 10px; font-weight:600; color:var(--text);">${m.receiver_name} <br/><span style="font-size:10px; font-weight:normal; color:var(--muted);">${m.receiver_email}</span></td>
            <td style="padding:10px 10px; color:var(--text); max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.message_text || ''}</td>
            <td style="padding:10px 10px;">${mediaHtml}</td>
            <td style="padding:10px 10px; color:var(--muted2);">${createdDate}</td>
            <td style="padding:10px 10px; text-align:right;">
              <button onclick="deleteAdminMessage(${m.id})" style="background:rgba(255,71,87,.12); border:1px solid rgba(255,71,87,.2); color:var(--red); border-radius:6px; padding:6px 10px; font-size:11px; cursor:pointer; font-weight:600;"><i class="ti ti-trash"></i> Delete</button>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error("Admin messages fetch error:", err);
  }
}

async function toggleUserOnline(targetId) {
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(`${API_URL}/api/admin/users/${targetId}/toggle-online?token=${token}`, {
      method: 'POST'
    });
    if (res.ok) {
      toast("🔌 User online status toggled!");
      loadAdminData();
      loadNearbyUsers();
    } else {
      toast("❌ Toggle failed");
    }
  } catch (err) {
    console.error(err);
  }
}

async function toggleUserBlock(targetId) {
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(`${API_URL}/api/admin/users/${targetId}/toggle-block?token=${token}`, {
      method: 'POST'
    });
    if (res.ok) {
      const data = await res.json();
      toast(data.is_blocked ? "🚫 User has been blocked!" : "✅ User has been unblocked!");
      loadAdminData();
      loadNearbyUsers();
    } else {
      toast("❌ Block toggle failed");
    }
  } catch (err) {
    console.error(err);
  }
}

function openAdminEditUser(userId, name, email, bio, location) {
  document.getElementById('admin-edit-userid-input').value = userId;
  document.getElementById('admin-edit-name-input').value = decodeURIComponent(name);
  document.getElementById('admin-edit-email-input').value = decodeURIComponent(email);
  document.getElementById('admin-edit-bio-input').value = decodeURIComponent(bio);
  document.getElementById('admin-edit-loc-input').value = decodeURIComponent(location);
  document.getElementById('admin-edit-user-modal').classList.add('open');
}

function closeAdminEditUser() {
  document.getElementById('admin-edit-user-modal').classList.remove('open');
}

async function saveAdminEditUser() {
  const userId = document.getElementById('admin-edit-userid-input').value;
  const name = document.getElementById('admin-edit-name-input').value.trim();
  const email = document.getElementById('admin-edit-email-input').value.trim();
  const bio = document.getElementById('admin-edit-bio-input').value.trim();
  const location = document.getElementById('admin-edit-loc-input').value.trim();
  const token = localStorage.getItem('token');

  if (!name || !email) {
    toast("⚠️ Name and Email are required");
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/admin/users/${userId}/edit?token=${token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, email, bio, location })
    });

    if (response.ok) {
      toast("💾 User updated successfully!");
      closeAdminEditUser();
      loadAdminData();
      loadNearbyUsers();
    } else {
      const data = await response.json();
      toast(`❌ Update failed: ${data.detail || 'Error'}`);
    }
  } catch (err) {
    console.error(err);
    toast("❌ Network error saving user data");
  }
}

async function deleteUser(targetId) {
  if (!confirm("⚠️ Are you sure you want to delete this user? This will erase all of their posts, stories, chats, and comments!")) return;
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(`${API_URL}/api/admin/users/${targetId}?token=${token}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      toast("🗑️ User deleted from database!");
      loadAdminData();
      loadNearbyUsers();
    } else {
      toast("❌ Delete failed");
    }
  } catch (err) {
    console.error(err);
  }
}

async function deletePost(postId) {
  if (!confirm("⚠️ Are you sure you want to delete this post?")) return;
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(`${API_URL}/api/admin/posts/${postId}?token=${token}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      toast("🗑️ Post deleted!");
      loadAdminData();
      loadFeed();
    } else {
      toast("❌ Delete failed");
    }
  } catch (err) {
    console.error(err);
  }
}

async function deleteAdminStory(storyId) {
  if (!confirm("⚠️ Are you sure you want to delete this story?")) return;
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(`${API_URL}/api/admin/stories/${storyId}?token=${token}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      toast("🗑️ Story deleted!");
      loadAdminData();
      loadStories();
    } else {
      toast("❌ Delete failed");
    }
  } catch (err) {
    console.error(err);
  }
}

async function deleteAdminMessage(msgId) {
  if (!confirm("⚠️ Are you sure you want to delete this message?")) return;
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(`${API_URL}/api/admin/messages/${msgId}?token=${token}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      toast("🗑️ Message deleted from database!");
      loadAdminData();
    } else {
      toast("❌ Delete failed");
    }
  } catch (err) {
    console.error(err);
  }
}


// ═══════════════════════════════════════════════════
// FOLLOWERS / FOLLOWING MODAL (Instagram Style)
// ═══════════════════════════════════════════════════

let _followModalUsers = [];   // cached list for search filtering
let _followModalCtx = null;   // { type: 'my' | 'user', mode: 'followers' | 'following', userId }

/**
 * Opens the followers or following sheet modal.
 * @param {'my'|'user'} profileCtx  - 'my' = own profile, 'user' = viewing someone else
 * @param {'followers'|'following'} mode
 */
async function openFollowModal(profileCtx, mode) {
  const bg = document.getElementById('follow-modal-bg');
  const titleEl = document.getElementById('follow-modal-title');
  const listEl = document.getElementById('follow-modal-list');
  const searchEl = document.getElementById('follow-modal-search');

  // Determine which user id to use
  let userId;
  if (profileCtx === 'my') {
    const me = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!me) return;
    userId = me.id;
  } else {
    // Other user profile — use currentModalPerson
    if (!currentModalPerson) return;
    userId = currentModalPerson.id;
  }

  _followModalCtx = { type: profileCtx, mode, userId };

  // Title
  titleEl.textContent = mode === 'followers' ? 'Followers' : 'Following';

  // Reset UI
  searchEl.value = '';
  listEl.innerHTML = `<div class="follow-modal-loading"><i class="ti ti-loader-2" style="font-size:22px;animation:spin 1s linear infinite"></i> Loading…</div>`;
  
  // Add spin animation if not already added
  if (!document.getElementById('spin-style')) {
    const s = document.createElement('style');
    s.id = 'spin-style';
    s.textContent = '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }

  // Open modal
  bg.style.display = 'flex';
  // Force reflow to trigger animation
  void bg.offsetWidth;
  bg.classList.add('open');

  // Fetch from API
  try {
    const endpoint = mode === 'followers'
      ? `${API_URL}/api/users/${userId}/followers`
      : `${API_URL}/api/users/${userId}/following`;

    const res = await fetch(endpoint);
    if (!res.ok) throw new Error('API error');
    const users = await res.json();
    _followModalUsers = users;
    renderFollowList(users);
  } catch(err) {
    listEl.innerHTML = `<div class="follow-modal-empty"><i class="ti ti-wifi-off"></i><p>Could not load users</p></div>`;
    console.error(err);
  }
}

function closeFollowModal() {
  const bg = document.getElementById('follow-modal-bg');
  const sheet = document.getElementById('follow-modal-sheet');
  // Animate out
  sheet.style.animation = 'fmSheetOut .22s ease forwards';
  if (!document.getElementById('fmout-style')) {
    const s = document.createElement('style');
    s.id = 'fmout-style';
    s.textContent = '@keyframes fmSheetOut{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:.5}}';
    document.head.appendChild(s);
  }
  setTimeout(() => {
    bg.classList.remove('open');
    bg.style.display = 'none';
    sheet.style.animation = '';
  }, 220);
}

function filterFollowList(query) {
  const q = query.toLowerCase().trim();
  if (!q) {
    renderFollowList(_followModalUsers);
    return;
  }
  renderFollowList(_followModalUsers.filter(u =>
    u.name.toLowerCase().includes(q) ||
    (u.bio || '').toLowerCase().includes(q) ||
    (u.location || '').toLowerCase().includes(q)
  ));
}

function renderFollowList(users) {
  const listEl = document.getElementById('follow-modal-list');
  const me = JSON.parse(localStorage.getItem('currentUser') || 'null');
  const myId = me ? me.id : null;
  const token = localStorage.getItem('token');
  const ctx = _followModalCtx;

  if (!users || users.length === 0) {
    listEl.innerHTML = `
      <div class="follow-modal-empty">
        <i class="ti ti-users"></i>
        <p>${ctx && ctx.mode === 'followers' ? 'No followers yet' : 'Not following anyone yet'}</p>
      </div>`;
    return;
  }

  listEl.innerHTML = users.map(u => {
    // Avatar
    let avContent;
    if (u.photo_url && u.photo_url.trim()) {
      const picUrl = u.photo_url.startsWith('/uploads') ? API_URL + u.photo_url : u.photo_url;
      avContent = `<img src="${picUrl}" alt="${u.name}" onerror="this.style.display='none';this.parentElement.textContent='${u.name.charAt(0).toUpperCase()}'">`;
    } else {
      avContent = `<span>${u.name.charAt(0).toUpperCase()}</span>`;
    }

    // Online dot
    const dotColor = u.is_online ? 'var(--green)' : 'var(--muted)';
    const dotTitle = u.is_online ? 'Online' : 'Offline';

    // Action button — show "Message" for other users, or "Follow/Following" toggle
    let actionBtn = '';
    if (myId && u.id !== myId) {
      // Show Message button only (follow toggle would need async check, keep it simple)
      actionBtn = `
        <button class="follow-user-action-btn message-btn" 
          onclick="event.stopPropagation();closeFollowModal();openChatWith('${u.name.replace(/'/g, "\\'")}')">
          <i class="ti ti-message-circle" style="font-size:13px"></i>
        </button>`;
    }

    const bio = u.bio ? u.bio.substring(0, 50) + (u.bio.length > 50 ? '…' : '') : (u.location || '');

    return `
      <div class="follow-user-row" onclick="closeFollowModal();openModalByApiUser(${JSON.stringify(u)})">
        <div class="follow-user-av">
          ${avContent}
          <div class="follow-user-av-dot" style="background:${dotColor}" title="${dotTitle}"></div>
        </div>
        <div class="follow-user-info">
          <div class="follow-user-name">${u.name}</div>
          ${bio ? `<div class="follow-user-bio">${bio}</div>` : ''}
        </div>
        ${actionBtn}
      </div>`;
  }).join('');
}

/**
 * Opens a user profile from the followers/following modal.
 * Tries to find them in the local `people` array first, falls back to minimal data.
 */
function openModalByApiUser(u) {
  // Try to match against loaded people
  const existing = people.find(p => p.id === u.id);
  if (existing) {
    openModal(existing.id);
    return;
  }

  // Build a minimal person object for the user profile page
  const minimal = {
    id: u.id,
    name: u.name,
    bio: u.bio || '',
    location: u.location || '',
    photoUrl: u.photo_url || null,
    is_online: u.is_online,
    bg: 'linear-gradient(135deg,#f0436a,#c44aff)',
    emoji: u.name.charAt(0).toUpperCase(),
    dist: '',
    match: 0,
    age: '',
    interests: [],
    stories: []
  };

  // Temporarily add to people so openModal can find it
  const tempIdx = people.findIndex(p => p.id === u.id);
  if (tempIdx === -1) people.push(minimal);
  openModal(u.id);
}

// ==================================================
// REAL-TIME NEW FEATURES (Comments, Sharing, Calls, Export/Deactivate)
// ==================================================

// --- COMMENTS ---
let currentCommentPostId = null;
async function openCommentsModal(postId) {
  currentCommentPostId = postId;
  const bg = document.getElementById('comments-modal-bg');
  const sheet = document.getElementById('comments-modal-sheet');
  const list = document.getElementById('comments-list');
  bg.style.display = 'block';
  setTimeout(() => { bg.style.opacity = '1'; sheet.style.transform = 'translateY(0)'; }, 10);
  
  list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted)">Loading comments...</div>`;
  
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(`${API_URL}/api/posts/${postId}/comments?token=${token}`);
    if(!res.ok) throw new Error('Failed to load');
    const data = await res.json();
    if(data.comments.length === 0) {
      list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted)">No comments yet. Be the first!</div>`;
    } else {
      list.innerHTML = data.comments.map(c => `
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--dark3);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
            ${c.user_pic ? `<img src="${c.user_pic.startsWith('http') ? c.user_pic : API_URL + c.user_pic}" style="width:100%;height:100%;object-fit:cover">` : '👤'}
          </div>
          <div>
            <div style="font-size:13px"><span style="font-weight:700">${c.user_name}</span> <span style="color:var(--muted);font-size:11px;margin-left:6px">${new Date(c.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div>
            <div style="font-size:14px;color:var(--text);margin-top:2px">${c.text}</div>
          </div>
        </div>
      `).join('');
    }
  } catch(e) {
    list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--red)">Failed to load comments</div>`;
  }
}

function closeCommentsModal() {
  const bg = document.getElementById('comments-modal-bg');
  const sheet = document.getElementById('comments-modal-sheet');
  bg.style.opacity = '0';
  sheet.style.transform = 'translateY(100%)';
  setTimeout(() => { bg.style.display = 'none'; }, 300);
}

async function submitComment() {
  const inp = document.getElementById('comment-input');
  const text = inp.value.trim();
  if(!text || !currentCommentPostId) return;
  
  inp.value = '';
  const token = localStorage.getItem('token');
  
  try {
    const res = await fetch(`${API_URL}/api/posts/${currentCommentPostId}/comments?token=${token}`, { 
      method:'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment_text: text }) 
    });
    if(res.ok) {
      openCommentsModal(currentCommentPostId); // reload
      loadFeed(); // Refresh the feed silently to update counts
    } else {
      toast('❌ Failed to post comment');
    }
  } catch(e) {
    toast('❌ Failed to post comment');
  }
}

// --- SHARING ---
async function sharePost(postId) {
  const url = `${window.location.origin}/?post=${postId}`;
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'NearMe Ultra Post',
        text: 'Check out this post on NearMe Ultra!',
        url: url
      });
      toast('↗️ Shared successfully!');
    } catch(err) {
      console.log('Error sharing', err);
    }
  } else {
    // Fallback
    try {
      await navigator.clipboard.writeText(url);
      toast('🔗 Link copied to clipboard!');
    } catch(err) {
      toast('❌ Failed to copy link');
    }
  }
}

// --- CALLS ---
let callStream = null;
let callTimeout = null;

async function startCall(type, name, photoUrl) {
  document.getElementById('call-name').innerText = name;
  const av = document.getElementById('call-av');
  av.innerHTML = photoUrl && photoUrl !== 'null' ? `<img src="${photoUrl.startsWith('http') ? photoUrl : API_URL + photoUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : '😎';
  document.getElementById('call-status').innerText = 'Calling...';
  
  document.getElementById('call-screen').style.display = 'flex';
  
  if(type === 'video') {
    try {
      callStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const videoEl = document.getElementById('call-local-video');
      videoEl.srcObject = callStream;
      videoEl.style.display = 'block';
    } catch(e) {
      toast('⚠️ Camera access denied');
    }
  }
  
  // Simulate ringing then unanswered
  callTimeout = setTimeout(() => {
    document.getElementById('call-status').innerText = 'Unanswered';
    setTimeout(endCall, 2000);
  }, 10000);
}

function toggleCallMute() {
  if(callStream) {
    callStream.getAudioTracks().forEach(t => t.enabled = !t.enabled);
    const btn = document.getElementById('call-mute-btn');
    btn.style.background = callStream.getAudioTracks()[0].enabled ? 'rgba(255,255,255,0.2)' : 'rgba(255,71,87,0.8)';
  }
}

function endCall() {
  clearTimeout(callTimeout);
  if(callStream) {
    callStream.getTracks().forEach(t => t.stop());
    callStream = null;
  }
  document.getElementById('call-local-video').style.display = 'none';
  document.getElementById('call-screen').style.display = 'none';
}

// --- ACCOUNT ACTIONS ---
async function exportData() {
  toast('⏳ Preparing data export...');
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(`${API_URL}/api/users/me/export?token=${token}`);
    if(res.ok) {
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'nearme_data_export.json';
      a.click();
      URL.revokeObjectURL(url);
      toast('✅ Data downloaded successfully!');
    } else {
      toast('❌ Export failed');
    }
  } catch(e) {
    toast('❌ Export failed');
  }
}

async function deactivateAccount() {
  if(!confirm("⚠️ WARNING: This will PERMANENTLY delete your account, posts, messages, and all data. Are you sure?")) return;
  
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(`${API_URL}/api/users/me?token=${token}`, { method: 'DELETE' });
    if(res.ok) {
      alert("Your account has been permanently deleted.");
      logoutUser();
    } else {
      toast('❌ Failed to delete account');
    }
  } catch(e) {
    toast('❌ Error deleting account');
  }
}
