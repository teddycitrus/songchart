"use client"

import { useEffect, useState } from "react";
import Image from 'next/image';

export default function Home() {
    const [songs, setSongs] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [loading2, setLoading2] = useState<string>("no");
    const [error, setError] = useState<string | null>(null);
    const [auth, authed] = useState<boolean>(false);
    const [form, formVisible] = useState<boolean>(false);
    const [message, setMessage] = useState<string>("");
    const [formData, setFormData] = useState({
        name: "",
        chords: "",
        key: "",
        transpose: 0,
        capo: "",
        bpm: 0,
        beat: ""
      });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
              throw new Error("error updating database");
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
            alert("refresh to see changes pottan");
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
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSongs();
  }, []);

  const checkAuth = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("auth") as HTMLInputElement;

    console.log("footer auth attempted; input =", input.value);

    if (input.value === "Kairos>Johnabum") {
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
          width={300} 
          height={300} 
          className="rounded-xl shadow-md"
        />
        </div>
        </div>)
  } else if (error) {  //display error message
    content = (<div>
        <h1 className="container3" style={{color:"ivory", fontSize:"36px", textAlign:"center"}}>dear pottan guy: {error}</h1>
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
          width={150}
          height={150}
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
  } else {
    footerContent = (<div>
      <footer>
        <button type="button" onClick={() => formVisible(!form)}>
          ADD
        </button>
        <button type="button" onClick={() => alert("ts not functional yet pottan guy")}>
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