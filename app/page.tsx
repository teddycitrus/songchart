"use client"

import { useEffect, useState } from "react";
import Image from 'next/image';
import { Song } from "../types/Song";

export default function Home() {
    /* type Song = {
      _id: string;
      name: "",
      chords: "",
      key: "",
      transpose: "",
      capo: "",
      bpm: "",
      beat: ""
    } */

    const [songs, setSongs] = useState<Song[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [loading2, setLoading2] = useState<string>("no");
    const [error, setError] = useState<string | null>(null);
    const [auth, authed] = useState<boolean>(false);
    const [editMode, setEditMode] = useState<boolean>(false);
    const [form, formVisible] = useState<boolean>(false);
    const [edit, editVisible] = useState<boolean>(false);
    const [selectedSong, setSelectedSong] = useState<Song>({
      _id: "",
      name: "",
      chords: "",
      key: "",
      transpose: "",
      capo: "",
      bpm: "",
      beat: ""
    });
    const [message, setMessage] = useState<string>("");
    const [formData, setFormData] = useState({
        name: "",
        chords: "",
        key: "",
        transpose: "",
        capo: "",
        bpm: "",
        beat: ""
      });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {   //used in both the Add form and the Edit form
        setFormData({ ...formData, [e.target.id]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
      console.log("submit button pressed\nData to upload:", formData);
      e.preventDefault();
        if(auth) {
          setLoading2("start");
          try {
            console.log("POST request attempt begun");
            const response = await fetch("/api/edit", {
              method: 'POST',
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify(formData),
            });
    
            setLoading2("end");

            if (!response.ok) {
              setMessage("something went wrong (tell mannullytard to check logs)");
              throw new Error("error adding object to database");
            } else {
              setMessage("chill down buddy, it worked (201)");
            }

            console.log("Server response: ", response);
      
          } catch (err) {
            if (err instanceof Error) {
                console.log(err.message);
              } else {
                console.log("Unknown error", err);
              }
          } finally {
            window.location.reload(); //refreshes page so that new entry is visible
          }
        }
    }

    useEffect(() => {      //updates the state of formData when an input field is changed in the update form
      setFormData({
        name: selectedSong?.name,
        chords: selectedSong?.chords,
        key: selectedSong?.key,
        transpose: selectedSong?.transpose,
        capo: selectedSong?.capo,
        bpm: selectedSong?.bpm,
        beat: selectedSong?.beat
      });
    }, [selectedSong]);

    const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
      console.log("update button pressed\nData to upload:", formData);
      e.preventDefault();
        if(auth) {
          setLoading2("start");
          try {
            console.log("POST request attempt begun");
            const response = await fetch("/api/update", {
              method: 'POST',
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ ...formData, _id: selectedSong?._id }),
            });
    
            setLoading2("end");

            if (!response.ok) {
              throw new Error("error adding object to database");
              setMessage("something went wrong (tell mannullytard to check logs)");
            } else {
              setMessage("chill down buddy, it worked (201)");
            }

            console.log("Server response: ", response);
      
          } catch (err) {
            if (err instanceof Error) {
                console.log(err.message);
              } else {
                console.log("Unknown error", err);
              }
          } finally {
            window.location.reload(); //refreshes page
          }
        }
    }

    useEffect(() => {
        const fetchSongs = async () => {
      try {
        const response = await fetch("/api/songs");
        
        if (!response.ok) {
          throw new Error('Failed to fetch songs');
        }

        const data = await response.json();
        setSongs(data);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unknown error occurred");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchSongs();
  }, []);

  const checkAuth = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const input = e.currentTarget.elements.namedItem("auth") as HTMLInputElement;

  const res = await fetch("/api/checkAuth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: input.value }),
  });

  const data = await res.json();

  if (data.ok) {
    authed(true);
  } else {
    alert("wrong password pottan");
  }
};

  let content;

  if(loading) {
    content = (<div className="container3">
        <div className="loader" style={{color:"ivory", fontSize:"2px"}}>
        <Image 
          src="/sanjigga.png" 
          alt="fat retard" 
          width={200} 
          height={200} 
          className="rounded-xl shadow-md"
        />
        </div>
        </div>)
  } else if (error) {  //display error message
    content = (<div>
        <h1 className="container3" style={{color:"ivory", fontSize:"36px", textAlign:"center"}}>dear pottan guy: {error}</h1>
    </div>)
  } else if (edit) { //editable rows
    content = (<div> <br />
        <table
        style={{ fontSize: "16px", textAlign: "center", maxWidth: "800px" }}
        id="ediTable"
        >
        <thead>
          <tr>
            <th>Song</th>
            <th>Key</th>
            <th>Trans.</th>
            <th>Capo</th>
            <th>BPM</th>
            <th>Beat</th>
          </tr>
        </thead>
        <tbody>
          {/* Map over the songs and render each one in a table row */}
          {songs.map((song, index) => (
            <tr
            key={index}
            onClick={() => setSelectedSong(song)}
            className={selectedSong === song ? "highlight" : ""}>
              <td><a target="_blank" style={{ color: "lightblue", textDecorationLine: "underline"}} href={song.chords}>{song.name}</a></td>
              <td>{song.key}</td>
              <td>{song.transpose}</td>
              <td>{song.capo}</td>
              <td>{song.bpm}</td>
              <td>{song.beat}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>)
  } else {  //if loaded and no error
    content = (<div> <br />
        <table style={{ fontSize: "16px", textAlign: "center", maxWidth: "800px" }}>
        <thead>
          <tr>
            <th>Song</th>
            <th>Key</th>
            <th>Trans.</th>
            <th>Capo</th>
            <th>BPM</th>
            <th>Beat</th>
          </tr>
        </thead>
        <tbody>
          {/* Map over the songs and render each one in a table row */}
          {songs.map((song, index) => (
            <tr key={index}>
              <td><a target="_blank" style={{ color: "lightblue", textDecorationLine: "underline"}} href={song.chords}>{song.name}</a></td>
              <td>{song.key}</td>
              <td>{song.transpose}</td>
              <td>{song.capo}</td>
              <td>{song.bpm}</td>
              <td>{song.beat}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>)
  }

  let footerContent;

  if(loading) {
    footerContent = (<div />)
  } else if(!auth) {
    footerContent = (<div>
      <footer>
        <form onSubmit={checkAuth}>
          <input type="text" placeholder="password goes here" name="auth">
          </input>
        </form>
      </footer>
    </div>)
  } else if(form) {
    if (loading2==="start") {
      footerContent = (<div className="container3">
        <div className="loader" style={{color:"ivory", fontSize:"2px"}}>
        <Image 
          src="/sanjigga.png"
          alt="fat retard" 
          width={120}
          height={120}
          style={{ maxWidth: "80%", height: "auto" }}
          className="rounded-xl shadow-md"
        />
        </div>
        </div>)
    } else if (loading2==="end") {
      footerContent = (<div>
        <h1>{message}</h1>
      </div>)
    } else {
    footerContent = (<div>
      <footer style={{height:"100%"}}>
        <form className="container" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Title</label><br />
            <input required type="text" id="name" placeholder="10,000 Reasons" onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="chords">Chords/Lyrics (URL)</label><br />
            <input required type="url" id="chords" placeholder="https://www.worshiptogether.com/songs/10-000-reasons-bless-the-lord/" onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="key">Key</label><br />
            <input type="text" id="key" placeholder="G Major" onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="transpose">Tranpose</label><br />
            <input type="text" id="transpose" placeholder="0" min="-11" max="+11" onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="capo">Capo</label><br />
            <input type="text" id="capo" min="0" placeholder="0" max="12" onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="bpm">Tempo (BPM)</label><br />
            <input type="text" id="bpm" min="0" max="200" placeholder="77" onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="beat">Beat</label><br />
            <input type="text" id="beat" placeholder="none" onChange={handleChange} />
          </div>
          <div style={{display:"flex", justifyContent:"space-between"}}>
            <button type="submit" style={{height:"6%", width:"55%", maxWidth:"180px"}}>SUBMIT</button>
            <p>-------</p>
            <button type="button" onClick={() => formVisible(!form)} style={{height:"6%", width:"55%", maxWidth:"180px"}}>
              RETURN
            </button>
          </div>
        </form>
      </footer>
    </div>)
    }
  } else if (edit) {
    if (editMode) {
      footerContent = (<div>
      <footer style={{height:"100%"}}>
        <form className="container" onSubmit={handleUpdate}>
          <div className="form-group">
            <label htmlFor="name">Title</label><br />
            <input required type="text" id="name" defaultValue={selectedSong?.name} readOnly />
          </div>
          <div className="form-group">
            <label htmlFor="chords">Chords/Lyrics (URL)</label><br />
            <input required type="url" id="chords" defaultValue={selectedSong?.chords} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="key">Key</label><br />
            <input type="text" id="key" defaultValue={selectedSong?.key} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="transpose">Tranpose</label><br />
            <input type="text" id="transpose" defaultValue={selectedSong?.transpose} min="-11" max="+11" onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="capo">Capo</label><br />
            <input type="text" id="capo" min="0" defaultValue={selectedSong?.capo} max="12" onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="bpm">Tempo (BPM)</label><br />
            <input type="text" id="bpm" min="0" max="200" defaultValue={selectedSong?.bpm} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="beat">Beat</label><br />
            <input type="text" id="beat" defaultValue={selectedSong?.beat} onChange={handleChange} />
          </div>
          <div style={{display:"flex", justifyContent:"space-between"}}>
            <button type="submit" style={{height:"6%", width:"55%", maxWidth:"180px"}}>SUBMIT</button>
            <p>-------</p>
            <button type="button" onClick={() => setEditMode(!editMode)} style={{height:"6%", width:"55%", maxWidth:"180px"}}>
              RETURN
            </button>
          </div>
        </form>
      </footer>
    </div>)
    } else {
      footerContent = (<div>
      <footer>
        <button
        type="button"
        onClick={() => setEditMode(!editMode)}
        style={{height:"60%", width:"16%", maxWidth:"135px"}}
        >
          {/*
              - Displays form that works like the 'add' form but prepopulated with the selected entry's data
              - Submits the changes to the database
              - Refreshes the page
          */}
          CONFIRM
        </button>
        <button
        type="button"
        onClick={() => editVisible(!edit)}
        style={{height:"60%", width:"16%", maxWidth:"120px"}}
        >
          {/*
              - Returns page to the neutral state
          */}
          RETURN
        </button>
        
      </footer>
    </div>)
    }
  } else {
    footerContent = (<div>
      <footer>
        <button type="button" onClick={() => formVisible(!form)}>
          {/*
              - Make the footer expand into a form that covers the screen
              - Enables user to input a validated song entry and submit to the database
              - Refreshes the page
          */}
          ADD
        </button>
        <button type="button" onClick={() => editVisible(!edit)}>
          {/*
              - Replaces the footer with instructions ("select the entry you want to edit")
              - Make the table rows interactive/actionable via onClick + event listener
              - Enables user to freely edit the entry, then submit
              - Refreshes the page
          */}
          EDIT
        </button>
      </footer>
    </div>)
  }

  return (
    <div>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      {content}
      {footerContent}
    </div>
  )
}
