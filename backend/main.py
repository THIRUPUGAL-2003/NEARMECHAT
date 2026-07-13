from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from jose import jwt
from datetime import datetime, timedelta
import asyncpg
import bcrypt
import os
import shutil
from dotenv import load_dotenv
from typing import Optional
# Load environment variables
load_dotenv()

import cloudinary
import cloudinary.uploader

cloudinary.config(secure=True)

# ==================================================
# CONFIG
# ==================================================

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://neondb_owner:npg_7UmdDhf4gJWw@ep-restless-butterfly-atmz9e7n-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require")
SECRET_KEY = os.getenv("SECRET_KEY", "nearme-secret-2025")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")

# Create uploads directory if it doesn't exist
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================================================
# FILE UPLOAD HELPER (CLOUDINARY / LOCAL FALLBACK)
# ==================================================

async def upload_file_helper(file: Optional[UploadFile], folder: str) -> str:
    if not file or not file.filename:
        return ""
    
    # Try Cloudinary first
    cloudinary_url = os.getenv("CLOUDINARY_URL")
    if cloudinary_url and not cloudinary_url.startswith("cloudinary://your_"):
        try:
            file.file.seek(0)
            result = cloudinary.uploader.upload(file.file, folder=folder, resource_type="auto")
            secure_url = result.get("secure_url")
            if secure_url:
                return secure_url
        except Exception as e:
            print(f"[WARN] Cloudinary upload failed, falling back to local storage: {e}")
            
    # Fallback to local storage
    try:
        file.file.seek(0)
        import uuid
        ext = os.path.splitext(file.filename)[1]
        filename = f"{uuid.uuid4()}{ext}"
        filepath = os.path.join(UPLOAD_DIR, filename)
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return f"/uploads/{filename}"
    except Exception as e:
        print(f"[ERROR] Local upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"File upload failed: {e}")

# ==================================================
# DATABASE
# ==================================================

db_pool = None

@app.on_event("startup")
async def startup():
    global db_pool
    db_pool = await asyncpg.create_pool(DATABASE_URL)
    print("[OK] Connected to PostgreSQL")
    
    # Initialize schemas
    async with db_pool.acquire() as conn:
        print("[OK] Initializing Database Schema...")
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR NOT NULL,
                email VARCHAR UNIQUE NOT NULL,
                password_hash VARCHAR NOT NULL,
                location VARCHAR,
                bio TEXT,
                lat DOUBLE PRECISION,
                lng DOUBLE PRECISION,
                is_online BOOLEAN DEFAULT FALSE,
                profile_pic VARCHAR,
                is_blocked BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                message_text TEXT,
                media_url VARCHAR,
                media_type VARCHAR,
                voice_duration INTEGER DEFAULT 0,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS posts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                caption TEXT,
                media_url VARCHAR,
                media_type VARCHAR,
                likes_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS post_likes (
                id SERIAL PRIMARY KEY,
                post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (post_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS comments (
                id SERIAL PRIMARY KEY,
                post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                text TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS user_likes (
                id SERIAL PRIMARY KEY,
                liker_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                liked_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                is_like BOOLEAN NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (liker_id, liked_id)
            );

            CREATE TABLE IF NOT EXISTS stories (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                text TEXT,
                bg_color VARCHAR,
                media_url VARCHAR,
                media_type VARCHAR,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS follows (
                id SERIAL PRIMARY KEY,
                follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                followed_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (follower_id, followed_id)
            );
        ''')
        
        # Migration: comments content -> text rename
        try:
            cols = await conn.fetch("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'comments' AND column_name = 'content'
            """)
            if cols:
                await conn.execute("ALTER TABLE comments RENAME COLUMN content TO text")
                print("[MIGRATION] Renamed comments.content to comments.text")
        except Exception as e:
            print(f"[MIGRATION] Renaming comments table column warning: {e}")
            
        # Seed mock users if empty
        users_count = await conn.fetchval("SELECT COUNT(*) FROM users")
        if users_count == 0:
            print("[SEED] Seeding mock users...")
            hashed_pwd = bcrypt.hashpw("pass123".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            mock_users = [
                ("Sarah", "sarah@gmail.com", hashed_pwd, "Adyar, Chennai", "Travel blogger and food lover. Let's find some cafe nearby!", 13.0900, 80.2600, True, "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=300&q=80&fit=crop"),
                ("Jason", "jason@gmail.com", hashed_pwd, "T-Nagar, Chennai", "Gym enthusiast and techie. Looking for gym partners and networking.", 13.0650, 80.2750, True, "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300&q=80&fit=crop"),
                ("Priya", "priya@gmail.com", hashed_pwd, "Anna Nagar, Chennai", "Classical singer. Love coffee and conversation.", 13.0850, 80.2800, True, "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&q=80&fit=crop"),
                ("Vikram", "vikram@gmail.com", hashed_pwd, "Velachery, Chennai", "Bike rider. Always ready for a highway ride.", 13.0720, 80.2550, False, "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&q=80&fit=crop"),
                ("Divya", "divya@gmail.com", hashed_pwd, "Nungambakkam, Chennai", "Artist & Painter. Working on dynamic design aesthetics.", 13.0780, 80.2900, True, "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&q=80&fit=crop"),
                ("Super Admin", "pugal@gmail.com", hashed_pwd, "Chennai", "Site administrator.", 13.0827, 80.2707, True, "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300&q=80&fit=crop")
            ]
            for name, email, pw, loc, bio, lat, lng, online, pic in mock_users:
                await conn.execute("""
                    INSERT INTO users (name, email, password_hash, location, bio, lat, lng, is_online, profile_pic)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """, name, email, pw, loc, bio, lat, lng, online, pic)
            print("[SEED] Done seeding mock users.")

@app.on_event("shutdown")
async def shutdown():
    if db_pool:
        await db_pool.close()

# ==================================================
# JWT
# ==================================================

def create_token(user_id: str):
    expire = datetime.utcnow() + timedelta(days=7)

    return jwt.encode(
        {
            "sub": user_id,
            "exp": expire
        },
        SECRET_KEY,
        algorithm=ALGORITHM
    )

def decode_token(token: str):
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )
        return payload.get("sub")
    except:
        return None

# ==================================================
# SCHEMAS
# ==================================================

class LoginRequest(BaseModel):
    email: str
    password: str

class LocationUpdate(BaseModel):
    token: str
    lat: float
    lng: float

# ==================================================
# WEBSOCKET MANAGER
# ==================================================

class ConnectionManager:
    def __init__(self):
        self.active_connections = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[str(user_id)] = websocket

    def disconnect(self, user_id: str):
        self.active_connections.pop(str(user_id), None)

    async def send_to(self, user_id: str, message: dict):
        ws = self.active_connections.get(str(user_id))
        if ws:
            try:
                await ws.send_json(message)
            except:
                self.disconnect(str(user_id))

    async def broadcast(self, message: dict, exclude=None):
        dead = []
        for uid, ws in self.active_connections.items():
            if uid == str(exclude):
                continue
            try:
                await ws.send_json(message)
            except:
                dead.append(uid)
        for uid in dead:
            self.active_connections.pop(uid, None)

manager = ConnectionManager()

# ==================================================
# AUTH ENDPOINTS
# ==================================================

@app.post("/api/signup")
async def signup(
    name: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    location: str = Form(""),
    bio: str = Form(""),
    lat: float = Form(13.0827),
    lng: float = Form(80.2707),
    profile_pic: UploadFile = File(None)
):
    if not name.strip():
        raise HTTPException(status_code=400, detail="Name required")
    if len(password) < 4:
        raise HTTPException(status_code=400, detail="Password too short")

    async with db_pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM users WHERE email=$1", email.lower().strip())
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")

        password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

        file_url = await upload_file_helper(profile_pic, "nearme/profiles")

        user = await conn.fetchrow(
            """
            INSERT INTO users
            (name, email, password_hash, location, bio, lat, lng, is_online, profile_pic)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, name, email, location, bio, lat, lng, profile_pic
            """,
            name.strip(), email.lower().strip(), password_hash, location, bio, lat, lng, True, file_url
        )

    token = create_token(str(user["id"]))
    return {"message": "Signup successful", "token": token, "user": dict(user)}


@app.post("/api/login")
async def login(req: LoginRequest):
    async with db_pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM users WHERE email=$1", req.email.lower().strip())

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    ok = bcrypt.checkpw(req.password.encode("utf-8"), user["password_hash"].encode("utf-8"))
    if not ok:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user.get("is_blocked"):
        raise HTTPException(status_code=403, detail="Your account has been blocked by an administrator")

    # Mark user online
    async with db_pool.acquire() as conn:
        await conn.execute("UPDATE users SET is_online=true WHERE id=$1", user["id"])

    token = create_token(str(user["id"]))
    return {
        "message": "Login successful",
        "token": token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "location": user["location"],
            "bio": user["bio"],
            "lat": user["lat"],
            "lng": user["lng"],
            "profile_pic": user.get("profile_pic", "")
        }
    }


# ==================================================
# PROFILE EDIT
# ==================================================

@app.post("/api/profile")
async def update_profile(
    token: str = Form(...),
    name: str = Form(...),
    bio: str = Form(""),
    location: str = Form(""),
    profile_pic: Optional[UploadFile] = File(None)
):
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    async with db_pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM users WHERE id=$1", int(user_id))
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        file_url = user["profile_pic"]
        if profile_pic and profile_pic.filename:
            file_url = await upload_file_helper(profile_pic, "nearme/profiles")

        await conn.execute(
            """
            UPDATE users
            SET name=$1, bio=$2, location=$3, profile_pic=$4
            WHERE id=$5
            """,
            name.strip(), bio.strip(), location.strip(), file_url, int(user_id)
        )

        updated_user = await conn.fetchrow(
            "SELECT id, name, email, location, bio, lat, lng, profile_pic FROM users WHERE id=$1",
            int(user_id)
        )

    return {"message": "Profile updated successfully", "user": dict(updated_user)}

@app.delete("/api/users/me")
async def delete_my_account(token: str):
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    async with db_pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id FROM users WHERE id=$1", int(user_id))
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Cascade delete comments/likes/posts/stories/follows/messages
        await conn.execute("DELETE FROM comments WHERE user_id=$1", int(user_id))
        
        # Delete related to posts authored by this user
        posts = await conn.fetch("SELECT id FROM posts WHERE user_id=$1", int(user_id))
        p_ids = [p["id"] for p in posts]
        if p_ids:
            await conn.execute("DELETE FROM post_likes WHERE post_id=ANY($1)", p_ids)
            await conn.execute("DELETE FROM comments WHERE post_id=ANY($1)", p_ids)
        
        await conn.execute("DELETE FROM post_likes WHERE user_id=$1", int(user_id))
        await conn.execute("DELETE FROM posts WHERE user_id=$1", int(user_id))
        await conn.execute("DELETE FROM stories WHERE user_id=$1", int(user_id))
        await conn.execute("DELETE FROM follows WHERE follower_id=$1 OR followed_id=$1", int(user_id))
        await conn.execute("DELETE FROM messages WHERE sender_id=$1 OR receiver_id=$1", int(user_id))
        
        await conn.execute("DELETE FROM users WHERE id=$1", int(user_id))

    return {"message": "Account successfully deleted"}

@app.get("/api/users/me/export")
async def export_my_data(token: str):
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    async with db_pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id, name, email, location, bio, created_at FROM users WHERE id=$1", int(user_id))
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
            
        posts = await conn.fetch("SELECT id, caption, media_url, bg_color, created_at FROM posts WHERE user_id=$1", int(user_id))
        messages = await conn.fetch("SELECT id, sender_id, receiver_id, message_text, created_at FROM messages WHERE sender_id=$1 OR receiver_id=$1", int(user_id))
        
        export_data = {
            "profile": dict(user),
            "posts": [dict(p) for p in posts],
            "messages": [dict(m) for m in messages]
        }
        
        # Serialize datetime objects to strings
        def json_serial(obj):
            if isinstance(obj, datetime):
                return obj.isoformat()
            raise TypeError("Type not serializable")
            
        import json
        return json.loads(json.dumps(export_data, default=json_serial))


# ==================================================
# LOCATION UPDATE
# ==================================================

@app.post("/api/location")
async def update_location(req: LocationUpdate):
    user_id = decode_token(req.token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    async with db_pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET lat=$1, lng=$2, is_online=true WHERE id=$3",
            req.lat, req.lng, int(user_id)
        )
    return {"success": True}


# ==================================================
# NEARBY USERS (LOCATION BASED FILTERING)
# ==================================================

@app.get("/")
async def home():
    return {
        "message": "NearMe API is running",
        "docs": "/docs"
    }

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

@app.get("/api/nearby")
async def nearby(lat: float = 13.0827, lng: float = 80.2707, radius: float = 10.0):
    async with db_pool.acquire() as conn:
        query = """
            SELECT id, name, email, location, bio, lat, lng, is_online, profile_pic, is_blocked,
            (6371 * acos(
                cos(radians($1)) * cos(radians(lat)) * cos(radians(lng) - radians($2)) + 
                sin(radians($1)) * sin(radians(lat))
            )) AS distance
            FROM users
            WHERE lat IS NOT NULL AND lng IS NOT NULL AND (is_blocked IS FALSE OR is_blocked IS NULL)
            ORDER BY distance ASC
        """
        users = await conn.fetch(query, lat, lng)

    nearby_users = []
    for x in users:
        user_dict = dict(x)
        if user_dict["distance"] <= radius:
            nearby_users.append(user_dict)

    return {"users": nearby_users}


# ==================================================
# CHAT / MESSAGING ENDPOINTS
# ==================================================

@app.get("/api/messages")
async def get_messages(token: str, other_user_id: int):
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    async with db_pool.acquire() as conn:
        # Mark messages as read
        await conn.execute(
            "UPDATE messages SET is_read=true WHERE sender_id=$1 AND receiver_id=$2",
            other_user_id, int(user_id)
        )

        rows = await conn.fetch(
            """
            SELECT id, sender_id, receiver_id, message_text, media_url, media_type, voice_duration, is_read, created_at
            FROM messages
            WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
            ORDER BY created_at ASC
            """,
            int(user_id), other_user_id
        )

    return {"messages": [dict(r) for r in rows]}


@app.get("/api/chats")
async def get_chats(token: str):
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    async with db_pool.acquire() as conn:
        # Fetch conversations list with latest message and unread count
        rows = await conn.fetch(
            """
            WITH contacts AS (
                SELECT DISTINCT CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS id
                FROM messages
                WHERE sender_id = $1 OR receiver_id = $1
            )
            SELECT c.id, u.name, u.profile_pic, u.is_online,
                   m.message_text AS last_text, m.created_at AS last_time, m.sender_id AS last_sender,
                   (SELECT COUNT(*) FROM messages WHERE sender_id = c.id AND receiver_id = $1 AND is_read = false) AS unread_count
            FROM contacts c
            JOIN users u ON u.id = c.id
            JOIN messages m ON m.id = (
                SELECT id FROM messages
                WHERE (sender_id = $1 AND receiver_id = c.id) OR (sender_id = c.id AND receiver_id = $1)
                ORDER BY created_at DESC LIMIT 1
            )
            ORDER BY last_time DESC
            """,
            int(user_id)
        )

    return {"chats": [dict(r) for r in rows]}


# ==================================================
# POSTS ENDPOINTS
# ==================================================

@app.post("/api/posts")
async def create_post(
    token: str = Form(...),
    caption: str = Form(...),
    media_type: str = Form("photo"),
    file: Optional[UploadFile] = File(None)
):
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    media_url = await upload_file_helper(file, "nearme/posts")

    async with db_pool.acquire() as conn:
        post = await conn.fetchrow(
            """
            INSERT INTO posts (user_id, caption, media_url, media_type, created_at, likes_count)
            VALUES ($1, $2, $3, $4, NOW(), 0)
            RETURNING id, caption, media_url, media_type, created_at, likes_count
            """,
            int(user_id), caption.strip(), media_url, media_type
        )
    return {"message": "Post created successfully", "post": dict(post)}


@app.get("/api/posts")
async def get_posts(lat: float, lng: float, radius: float = 10.0, token: Optional[str] = None):
    user_id = decode_token(token) if token else None
    async with db_pool.acquire() as conn:
        if user_id:
            query = """
                SELECT p.id, p.user_id, p.caption, p.media_url, p.media_type, p.likes_count, p.created_at,
                       u.name AS author_name, u.profile_pic AS author_pic,
                       (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comments_count,
                       (6371 * acos(
                           cos(radians($1)) * cos(radians(u.lat)) * cos(radians(u.lng) - radians($2)) + 
                           sin(radians($1)) * sin(radians(u.lat))
                       )) AS distance,
                       EXISTS(SELECT 1 FROM post_likes WHERE post_id=p.id AND user_id=$3) AS is_liked
                FROM posts p
                JOIN users u ON u.id = p.user_id
                WHERE u.lat IS NOT NULL AND u.lng IS NOT NULL
                ORDER BY p.created_at DESC
            """
            rows = await conn.fetch(query, lat, lng, int(user_id))
        else:
            query = """
                SELECT p.id, p.user_id, p.caption, p.media_url, p.media_type, p.likes_count, p.created_at,
                       u.name AS author_name, u.profile_pic AS author_pic,
                       (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comments_count,
                       (6371 * acos(
                           cos(radians($1)) * cos(radians(u.lat)) * cos(radians(u.lng) - radians($2)) + 
                           sin(radians($1)) * sin(radians(u.lat))
                       )) AS distance,
                       false AS is_liked
                FROM posts p
                JOIN users u ON u.id = p.user_id
                WHERE u.lat IS NOT NULL AND u.lng IS NOT NULL
                ORDER BY p.created_at DESC
            """
            rows = await conn.fetch(query, lat, lng)

    feed = []
    for r in rows:
        post_dict = dict(r)
        if post_dict["distance"] <= radius:
            feed.append(post_dict)

    return {"posts": feed}



# ==================================================
# STORIES ENDPOINTS
# ==================================================

@app.post("/api/stories")
async def create_story(
    token: str = Form(...),
    text: str = Form(""),
    bg_color: str = Form(""),
    media_type: str = Form("photo"),
    file: Optional[UploadFile] = File(None)
):
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    media_url = await upload_file_helper(file, "nearme/stories")

    async with db_pool.acquire() as conn:
        story = await conn.fetchrow(
            """
            INSERT INTO stories (user_id, text, bg_color, media_url, media_type, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            RETURNING id, text, bg_color, media_url, media_type, created_at
            """,
            int(user_id), text.strip(), bg_color.strip(), media_url, media_type
        )
    return {"message": "Story created successfully", "story": dict(story)}


@app.get("/api/stories")
async def get_stories(lat: float, lng: float, radius: float = 10.0):
    async with db_pool.acquire() as conn:
        # Retrieve stories from the last 24 hours
        query = """
            SELECT s.id, s.user_id, s.text, s.bg_color, s.media_url, s.media_type, s.created_at,
                   u.name AS author_name, u.profile_pic AS author_pic,
                   (6371 * acos(
                       cos(radians($1)) * cos(radians(u.lat)) * cos(radians(u.lng) - radians($2)) + 
                       sin(radians($1)) * sin(radians(u.lat))
                   )) AS distance
            FROM stories s
            JOIN users u ON u.id = s.user_id
            WHERE s.created_at >= NOW() - INTERVAL '24 hours' AND u.lat IS NOT NULL AND u.lng IS NOT NULL
            ORDER BY s.created_at ASC
        """
        rows = await conn.fetch(query, lat, lng)

    active_stories = []
    for r in rows:
        story_dict = dict(r)
        if story_dict["distance"] <= radius:
            active_stories.append(story_dict)

    return {"stories": active_stories}


# ==================================================
# WEBSOCKET (REAL-TIME AND PERSISTENCE)
# ==================================================

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str
):
    # Check if user is blocked
    async with db_pool.acquire() as conn:
        user = await conn.fetchrow("SELECT is_blocked FROM users WHERE id=$1", int(user_id))
        if user and user["is_blocked"]:
            await websocket.accept()
            await websocket.send_json({"type": "blocked"})
            await websocket.close(code=4003)
            return

    await manager.connect(user_id, websocket)
    # Mark user online in DB
    async with db_pool.acquire() as conn:
        await conn.execute("UPDATE users SET is_online=true WHERE id=$1", int(user_id))

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "chat":
                msg_text = data.get("message", "")
                to_user_id = int(data.get("to"))
                media_url = data.get("media_url", "")
                media_type = data.get("media_type", "text")
                voice_duration = data.get("voice_duration", 0)

                # Save message to Neon PostgreSQL Database
                async with db_pool.acquire() as conn:
                    message_row = await conn.fetchrow(
                        """
                        INSERT INTO messages
                        (sender_id, receiver_id, message_text, media_url, media_type, voice_duration, is_read, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                        RETURNING id, sender_id, receiver_id, message_text, media_url, media_type, voice_duration, created_at
                        """,
                        int(user_id), to_user_id, msg_text, media_url, media_type, voice_duration, False
                    )

                # Broadcast message to recipient WebSocket if online
                msg_payload = {
                    "type": "chat",
                    "from": int(user_id),
                    "message": msg_text,
                    "media_url": media_url,
                    "media_type": media_type,
                    "voice_duration": voice_duration,
                    "created_at": str(message_row["created_at"]),
                    "id": message_row["id"]
                }
                await manager.send_to(str(to_user_id), msg_payload)

    except WebSocketDisconnect:
        manager.disconnect(user_id)
        # Mark user offline in DB
        async with db_pool.acquire() as conn:
            await conn.execute("UPDATE users SET is_online=false WHERE id=$1", int(user_id))


# ==================================================
# ADMIN PANEL ENDPOINTS
# ==================================================

async def check_admin_token(token: str):
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    async with db_pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id, email FROM users WHERE id=$1", int(user_id))
        if not user or user["email"] != "pugal@gmail.com":
            raise HTTPException(status_code=403, detail="Access denied. Administrators only.")
        return user

@app.get("/api/admin/users")
async def admin_get_users(token: str):
    await check_admin_token(token)
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, name, email, location, bio, lat, lng, is_online, profile_pic, is_blocked FROM users ORDER BY id ASC"
        )
    return {"users": [dict(r) for r in rows]}

@app.post("/api/admin/users/{target_id}/toggle-online")
async def admin_toggle_online(target_id: int, token: str):
    await check_admin_token(token)
    async with db_pool.acquire() as conn:
        user = await conn.fetchrow("SELECT is_online FROM users WHERE id=$1", target_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        new_status = not user["is_online"]
        await conn.execute("UPDATE users SET is_online=$1 WHERE id=$2", new_status, target_id)
    return {"success": True, "is_online": new_status}

@app.post("/api/admin/users/{target_id}/toggle-block")
async def admin_toggle_block(target_id: int, token: str):
    await check_admin_token(token)
    async with db_pool.acquire() as conn:
        user = await conn.fetchrow("SELECT is_blocked FROM users WHERE id=$1", target_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        new_status = not (user["is_blocked"] or False)
        await conn.execute("UPDATE users SET is_blocked=$1, is_online=false WHERE id=$2", new_status, target_id)
        
        # If user is blocked, force disconnect their websocket
        if new_status:
            try:
                await manager.send_to(str(target_id), {"type": "blocked"})
                manager.disconnect(str(target_id))
            except Exception as e:
                print("Failed to notify blocked websocket:", e)
                
    return {"success": True, "is_blocked": new_status}

class AdminEditUserRequest(BaseModel):
    name: str
    email: str
    location: str
    bio: str

@app.post("/api/admin/users/{target_id}/edit")
async def admin_edit_user(target_id: int, req: AdminEditUserRequest, token: str):
    await check_admin_token(token)
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    
    async with db_pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM users WHERE email=$1 AND id!=$2", req.email.lower().strip(), target_id)
        if existing:
            raise HTTPException(status_code=400, detail="Email is already used by another account")
        await conn.execute(
            """
            UPDATE users
            SET name=$1, email=$2, location=$3, bio=$4
            WHERE id=$5
            """,
            req.name.strip(), req.email.lower().strip(), req.location.strip(), req.bio.strip(), target_id
        )
    return {"success": True}

@app.delete("/api/admin/users/{target_id}")
async def admin_delete_user(target_id: int, token: str):
    await check_admin_token(token)
    async with db_pool.acquire() as conn:
        # Cascade delete comments/likes/posts/stories/follows/messages
        await conn.execute("DELETE FROM comments WHERE user_id=$1", target_id)
        post_ids = await conn.fetch("SELECT id FROM posts WHERE user_id=$1", target_id)
        p_ids = [r["id"] for r in post_ids]
        if p_ids:
            await conn.execute("DELETE FROM post_likes WHERE post_id=ANY($1)", p_ids)
            await conn.execute("DELETE FROM comments WHERE post_id=ANY($1)", p_ids)
        await conn.execute("DELETE FROM post_likes WHERE user_id=$1", target_id)
        await conn.execute("DELETE FROM posts WHERE user_id=$1", target_id)
        await conn.execute("DELETE FROM stories WHERE user_id=$1", target_id)
        await conn.execute("DELETE FROM follows WHERE follower_id=$1 OR followed_id=$1", target_id)
        await conn.execute("DELETE FROM messages WHERE sender_id=$1 OR receiver_id=$1", target_id)
        await conn.execute("DELETE FROM users WHERE id=$1", target_id)
    return {"success": True}

@app.get("/api/admin/posts")
async def admin_get_posts(token: str):
    await check_admin_token(token)
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT p.id, p.user_id, p.caption, p.media_url, p.media_type, p.likes_count, p.created_at,
                   u.name AS author_name, u.email AS author_email
            FROM posts p
            JOIN users u ON u.id = p.user_id
            ORDER BY p.created_at DESC
            """
        )
    return {"posts": [dict(r) for r in rows]}

@app.delete("/api/admin/posts/{post_id}")
async def admin_delete_post(post_id: int, token: str):
    await check_admin_token(token)
    async with db_pool.acquire() as conn:
        await conn.execute("DELETE FROM post_likes WHERE post_id=$1", post_id)
        await conn.execute("DELETE FROM comments WHERE post_id=$1", post_id)
        await conn.execute("DELETE FROM posts WHERE id=$1", post_id)
    return {"success": True}

@app.get("/api/admin/stories")
async def admin_get_stories(token: str):
    await check_admin_token(token)
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT s.id, s.user_id, s.text, s.bg_color, s.media_url, s.media_type, s.created_at,
                   u.name AS author_name, u.email AS author_email
            FROM stories s
            JOIN users u ON u.id = s.user_id
            ORDER BY s.created_at DESC
            """
        )
    return {"stories": [dict(r) for r in rows]}

@app.delete("/api/admin/stories/{story_id}")
async def admin_delete_story(story_id: int, token: str):
    await check_admin_token(token)
    async with db_pool.acquire() as conn:
        await conn.execute("DELETE FROM stories WHERE id=$1", story_id)
    return {"success": True}

@app.get("/api/admin/messages")
async def admin_get_messages(token: str):
    await check_admin_token(token)
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT m.id, m.sender_id, m.receiver_id, m.message_text, m.media_url, m.media_type, m.created_at,
                   u1.name AS sender_name, u1.email AS sender_email,
                   u2.name AS receiver_name, u2.email AS receiver_email
            FROM messages m
            JOIN users u1 ON u1.id = m.sender_id
            JOIN users u2 ON u2.id = m.receiver_id
            ORDER BY m.created_at DESC
            LIMIT 500
            """
        )
    return {"messages": [dict(r) for r in rows]}

@app.delete("/api/admin/messages/{message_id}")
async def admin_delete_message(message_id: int, token: str):
    await check_admin_token(token)
    async with db_pool.acquire() as conn:
        await conn.execute("DELETE FROM messages WHERE id=$1", message_id)
    return {"success": True}


# ==================================================
# FOLLOW / UNFOLLOW SYSTEM
# ==================================================

@app.post("/api/users/{target_id}/follow")
async def toggle_follow(target_id: int, token: str):
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    if int(user_id) == target_id:
        raise HTTPException(status_code=400, detail="You cannot follow yourself")
        
    async with db_pool.acquire() as conn:
        # Check if already following
        row = await conn.fetchrow(
            "SELECT 1 FROM follows WHERE follower_id=$1 AND followed_id=$2",
            int(user_id), target_id
        )
        if row:
            # Unfollow
            await conn.execute(
                "DELETE FROM follows WHERE follower_id=$1 AND followed_id=$2",
                int(user_id), target_id
            )
            following = False
        else:
            # Follow
            await conn.execute(
                "INSERT INTO follows (follower_id, followed_id, created_at) VALUES ($1, $2, NOW())",
                int(user_id), target_id
            )
            following = True
            
    return {"success": True, "following": following}

@app.get("/api/users/{target_id}/is-following")
async def check_following(target_id: int, token: str):
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT 1 FROM follows WHERE follower_id=$1 AND followed_id=$2",
            int(user_id), target_id
        )
    return {"following": row is not None}

@app.get("/api/users/{target_id}/profile-stats")
async def profile_stats(target_id: int):
    async with db_pool.acquire() as conn:
        posts_count = await conn.fetchval("SELECT COUNT(*) FROM posts WHERE user_id=$1", target_id)
        followers = await conn.fetchval("SELECT COUNT(*) FROM follows WHERE followed_id=$1", target_id)
        following = await conn.fetchval("SELECT COUNT(*) FROM follows WHERE follower_id=$1", target_id)
    return {
        "posts_count": posts_count,
        "followers_count": followers,
        "following_count": following
    }

@app.get("/api/users/{target_id}/followers")
async def get_followers(target_id: int):
    """Return list of users who follow target_id"""
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT u.id, u.name, u.profile_pic, u.is_online, u.bio, u.location
            FROM follows f
            JOIN users u ON u.id = f.follower_id
            WHERE f.followed_id = $1
            ORDER BY f.created_at DESC
            """,
            target_id
        )
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "photo_url": r["profile_pic"] or "",
            "is_online": r["is_online"],
            "bio": r["bio"] or "",
            "location": r["location"] or ""
        }
        for r in rows
    ]

@app.get("/api/users/{target_id}/following")
async def get_following(target_id: int):
    """Return list of users that target_id follows"""
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT u.id, u.name, u.profile_pic, u.is_online, u.bio, u.location
            FROM follows f
            JOIN users u ON u.id = f.followed_id
            WHERE f.follower_id = $1
            ORDER BY f.created_at DESC
            """,
            target_id
        )
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "photo_url": r["profile_pic"] or "",
            "is_online": r["is_online"],
            "bio": r["bio"] or "",
            "location": r["location"] or ""
        }
        for r in rows
    ]


# ==================================================
# TINDER SWIPE SYSTEM
# ==================================================

class SwipeRequest(BaseModel):
    target_id: int
    is_like: bool

@app.post("/api/swipe")
async def swipe_user(req: SwipeRequest, token: str):
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    if int(user_id) == req.target_id:
        raise HTTPException(status_code=400, detail="You cannot swipe on yourself")
        
    async with db_pool.acquire() as conn:
        # Insert or update swipe in user_likes table
        await conn.execute(
            """
            INSERT INTO user_likes (liker_id, liked_id, is_like, created_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (liker_id, liked_id) DO UPDATE SET is_like=$3, created_at=NOW()
            """,
            int(user_id), req.target_id, req.is_like
        )
        
        match = False
        if req.is_like:
            # Check for mutual like
            mutual = await conn.fetchrow(
                "SELECT 1 FROM user_likes WHERE liker_id=$1 AND liked_id=$2 AND is_like=true",
                req.target_id, int(user_id)
            )
            if mutual:
                match = True
                
    return {"success": True, "match": match}

@app.get("/api/swipe/candidates")
async def get_swipe_candidates(token: str, lat: float, lng: float, radius: float = 10.0):
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
        
    async with db_pool.acquire() as conn:
        # Query nearby users who are NOT the requester, are not blocked, and have NOT been swiped yet
        query = """
            SELECT id, name, email, location, bio, lat, lng, is_online, profile_pic,
            (6371 * acos(
                cos(radians($1)) * cos(radians(lat)) * cos(radians(lng) - radians($2)) + 
                sin(radians($1)) * sin(radians(lat))
            )) AS distance
            FROM users
            WHERE lat IS NOT NULL AND lng IS NOT NULL 
              AND id != $3 
              AND (is_blocked IS FALSE OR is_blocked IS NULL)
              AND id NOT IN (SELECT liked_id FROM user_likes WHERE liker_id = $3)
            ORDER BY distance ASC
        """
        rows = await conn.fetch(query, lat, lng, int(user_id))
        
    candidates = []
    for r in rows:
        user_dict = dict(r)
        if user_dict["distance"] <= radius:
            user_dict["age"] = 20 + (user_dict["id"] % 8)
            user_dict["interests"] = ["🎵 Music", "✈️ Travel", "🍕 Food", "💪 Fitness", "🎨 Art", "📚 Books", "🎮 Gaming", "🏍️ Bikes", "📸 Photo"]
            user_dict["interests"] = [
                user_dict["interests"][user_dict["id"] % 9],
                user_dict["interests"][(user_dict["id"] + 3) % 9],
                user_dict["interests"][(user_dict["id"] + 7) % 9]
            ]
            candidates.append(user_dict)
            
    return {"candidates": candidates}


# ==================================================
# POST LIKES & COMMENTS
# ==================================================

@app.post("/api/posts/{post_id}/like")
async def toggle_post_like(post_id: int, token: str):
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
        
    async with db_pool.acquire() as conn:
        liked = await conn.fetchrow(
            "SELECT 1 FROM post_likes WHERE post_id=$1 AND user_id=$2",
            post_id, int(user_id)
        )
        if liked:
            await conn.execute("DELETE FROM post_likes WHERE post_id=$1 AND user_id=$2", post_id, int(user_id))
            await conn.execute("UPDATE posts SET likes_count=GREATEST(0, likes_count-1) WHERE id=$1", post_id)
            is_liked = False
        else:
            await conn.execute("INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)", post_id, int(user_id))
            await conn.execute("UPDATE posts SET likes_count=likes_count+1 WHERE id=$1", post_id)
            is_liked = True
            
        likes_count = await conn.fetchval("SELECT likes_count FROM posts WHERE id=$1", post_id)
        
    return {"success": True, "liked": is_liked, "likes_count": likes_count}

class CommentRequest(BaseModel):
    comment_text: str

@app.post("/api/posts/{post_id}/comments")
async def add_post_comment(post_id: int, req: CommentRequest, token: str):
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    if not req.comment_text.strip():
        raise HTTPException(status_code=400, detail="Comment content required")
        
    async with db_pool.acquire() as conn:
        comment = await conn.fetchrow(
            """
            INSERT INTO comments (post_id, user_id, text, created_at)
            VALUES ($1, $2, $3, NOW())
            RETURNING id, post_id, user_id, text as comment_text, created_at
            """,
            post_id, int(user_id), req.comment_text.strip()
        )
        user = await conn.fetchrow("SELECT name, profile_pic FROM users WHERE id=$1", int(user_id))
        
    comment_dict = dict(comment)
    comment_dict["user_name"] = user["name"]
    comment_dict["user_pic"] = user["profile_pic"]
    return {"success": True, "comment": comment_dict}

@app.get("/api/posts/{post_id}/comments")
async def get_post_comments(post_id: int):
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT c.id, c.post_id, c.user_id, c.text, c.created_at,
                   u.name AS user_name, u.profile_pic AS user_pic
            FROM comments c
            JOIN users u ON u.id = c.user_id
            WHERE c.post_id = $1
            ORDER BY c.created_at ASC
            """,
            post_id
        )
    return {"comments": [dict(r) for r in rows]}

@app.delete("/api/comments/{comment_id}")
async def delete_post_comment(comment_id: int, token: str):
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
        
    async with db_pool.acquire() as conn:
        comment = await conn.fetchrow("SELECT user_id, post_id FROM comments WHERE id=$1", comment_id)
        if not comment:
            raise HTTPException(status_code=404, detail="Comment not found")
            
        is_admin = False
        user_row = await conn.fetchrow("SELECT email FROM users WHERE id=$1", int(user_id))
        if user_row and user_row["email"] == "pugal@gmail.com":
            is_admin = True
            
        if comment["user_id"] != int(user_id) and not is_admin:
            raise HTTPException(status_code=403, detail="Permission denied")
            
        await conn.execute("DELETE FROM comments WHERE id=$1", comment_id)
        
    return {"success": True}


# ==================================================
# CHAT DELETION
# ==================================================

@app.delete("/api/messages/{message_id}")
async def delete_message(message_id: int, token: str):
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
        
    async with db_pool.acquire() as conn:
        msg = await conn.fetchrow("SELECT sender_id, receiver_id FROM messages WHERE id=$1", message_id)
        if not msg:
            raise HTTPException(status_code=404, detail="Message not found")
            
        is_admin = False
        user_row = await conn.fetchrow("SELECT email FROM users WHERE id=$1", int(user_id))
        if user_row and user_row["email"] == "pugal@gmail.com":
            is_admin = True
            
        if int(user_id) not in (msg["sender_id"], msg["receiver_id"]) and not is_admin:
            raise HTTPException(status_code=403, detail="Permission denied")
            
        await conn.execute("DELETE FROM messages WHERE id=$1", message_id)
        
    return {"success": True}

@app.delete("/api/chats/{other_user_id}")
async def clear_conversation(other_user_id: int, token: str):
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
        
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            DELETE FROM messages
            WHERE (sender_id = $1 AND receiver_id = $2)
               OR (sender_id = $2 AND receiver_id = $1)
            """,
            int(user_id), other_user_id
        )
    return {"success": True}


# ==================================================
# MORE ADMIN PANEL ENDPOINTS
# ==================================================

class AdminEditPostRequest(BaseModel):
    caption: str

@app.post("/api/admin/posts/{post_id}/edit")
async def admin_edit_post(post_id: int, req: AdminEditPostRequest, token: str):
    await check_admin_token(token)
    async with db_pool.acquire() as conn:
        await conn.execute("UPDATE posts SET caption=$1 WHERE id=$2", req.caption.strip(), post_id)
    return {"success": True}

@app.get("/api/admin/comments")
async def admin_get_comments(token: str):
    await check_admin_token(token)
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT c.id, c.post_id, c.user_id, c.text AS comment_text, c.created_at,
                   u.name AS author_name, u.email AS author_email,
                   p.caption AS post_caption
            FROM comments c
            JOIN users u ON u.id = c.user_id
            JOIN posts p ON p.id = c.post_id
            ORDER BY c.created_at DESC
            """
        )
    return {"comments": [dict(r) for r in rows]}


@app.post("/api/messages/upload")
async def upload_message_media(
    token: str = Form(...),
    file: UploadFile = File(...)
):
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
        
    media_url = await upload_file_helper(file, "nearme/chat")
    media_type = "file"
    content_type = file.content_type or ""
    if content_type.startswith("image/"):
        media_type = "photo"
    elif content_type.startswith("video/"):
        media_type = "video"
    elif content_type.startswith("audio/"):
        media_type = "voice"
        
    return {
        "media_url": media_url,
        "media_type": media_type
    }


# ==================================================
# STATIC FILES & UPLOADS MOUNTING
# ==================================================

app.mount(
    "/uploads",
    StaticFiles(directory=UPLOAD_DIR),
    name="uploads"
)
