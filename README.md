# Choir Songlist 🎶

This is a web-based application designed to help choir members easily access, update, and manage the entire music collection; sheet music, lyrics, tempo, keys, and more from any device. Choir prep in the cloud > dusty binders that get worn over time.

## 🧠 Tech Stack

- **Frontend**: Next.js (React)
- **Backend**: Node.js (API routes)
- **Database**: MongoDB (flexible, scalable song storage)

## 🚀 Features

- 📜 Digital database of songs, accessible from phones, tablets, or desktops
- 🎼 View each song’s metadata: 
  - Title, tempo (BPM), key
  - Transposable sheet music or lyrics link
- ✏️ Create and Read song entries (Update feature in progress)

## 🛠️ How It Works

1. User visits the dashboard and browses the list of songs.
2. Each song entry includes metadata and a link to external resources (e.g., PDFs or chord charts).
3. Authorized users can:
   - Add new songs to the database
   - Edit details like key, tempo, or lyric links (WIP)
   - Delete outdated songs (WIP)
4. MongoDB stores song entries with flexibility for different types of performances and teams.

## 📦 Installation

```bash
git clone https://github.com/your-username/choir-songlist.git
cd choir-songlist
npm install
````

Create a `.env.local` file:

```
MONGODB_URI=your-mongodb-uri
```

Then run:

```bash
npm run dev
```

Access it at `http://localhost:3000`

## 📂 Project Structure

```
/pages
  └── page.tsx      # This project is an SPA (Single Page Application)

/api
  └── songs    # 'Read' operation; fetches all song entries from MongoDB
  └── edit     # named incorrectly, 'Create' operation; submits the JSON object for a new song entry to MongoDB

/lib
  └── mongodb.ts            # DB connection helper
```

## 🗂️ Example Song Entry

```json
{
  "name": "10,000 Reasons",
  "chords": "https://www.worshiptogether.com/songs/10-000-reasons-bless-the-lord/",
  "key": "G Major",
  "transpose": 0,
  "capo": "none",
  "bpm": 77,
  "beat": "none"
}
```

## 📅 Timeline

Project developed in **April 2025** to support church choir organization and reduce rehearsal friction.

## 🙏 Why It Matters

* No more heated arguments trying to remember the configurations for a song
* Instantly accessible songs across any key
* Simplifies communication and set planning
