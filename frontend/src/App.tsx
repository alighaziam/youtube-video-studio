import { useState } from "react";

const scenes = [
  ["01", "Hook — The hidden cost of coupling", "عنوان و شروع", "00:12"],
  ["02", "Why architecture matters", "مفهوم", "00:28"],
  ["03", "A modular monolith", "دیاگرام معماری", "00:35"],
  ["04", "Module boundaries in code", "نمایش کد", "00:42"],
  ["05", "Trade-offs and recap", "جمع‌بندی", "00:25"],
];

export default function App() {
  const [active, setActive] = useState(2);
  const [locale, setLocale] = useState<"fa" | "en">("fa");
  const [tab, setTab] = useState("design");
  const fa = locale === "fa";
  return <div className={fa ? "app rtl" : "app ltr"} dir={fa ? "rtl" : "ltr"}>
    <header className="topbar">
      <div className="brand"><span className="logo">▣</span><div><b>FrameLab</b><small>VIDEO PRODUCTION STUDIO</small></div></div>
      <div className="project"><i/> {fa ? "درس ۸ — Modular Monolith در عمل" : "Lesson 08 — Modular Monolith in Practice"}</div>
      <div className="actions"><button onClick={() => setLocale(fa ? "en" : "fa")}>{fa ? "EN" : "فا"}</button><button className="primary">{fa ? "خروجی گرفتن" : "Export video"}</button></div>
    </header>
    <aside className="sidebar">
      <label>{fa ? "فضای تولید" : "WORKSPACE"}</label>
      <a className="active">▣　{fa ? "ویرایشگر ویدیو" : "Video editor"}</a><a>▤　{fa ? "پروژه‌ها" : "Projects"}</a><a>▧　{fa ? "قالب‌ها و برند" : "Templates & brand"}</a><a>▣　{fa ? "کتابخانه رسانه" : "Media library"}</a>
      <hr/><label>{fa ? "مراحل تولید" : "PRODUCTION"}</label>
      <a>✎　{fa ? "سناریو و استوری‌بورد" : "Script & storyboard"}</a><a>♫　{fa ? "گویندگی و صدا" : "Voice & audio"}</a><a>▤　{fa ? "زیرنویس" : "Subtitles"}</a><a>✧　{fa ? "بسته انتشار" : "Publishing pack"}</a>
      <div className="local">● {fa ? "پردازش محلی · بدون فضای ابری" : "Local processing · No cloud"}</div>
    </aside>
    <main className="main">
      <section className="scenes">
        <div className="heading"><div><small>STORYBOARD</small><h2>{fa ? "صحنه‌های ویدیو" : "Video scenes"} <em>05</em></h2></div><button>＋</button></div>
        {scenes.map((s,i)=><button key={s[0]} onClick={()=>setActive(i)} className={active===i?"scene selected":"scene"}><span className="thumb">{s[0]}<b>{["✧","▤","⌘","{ }","✓"][i]}</b></span><span className="scene-text"><strong>{s[1]}</strong><small>{s[2]}</small><small>{s[3]}</small></span><span className="dots">···</span></button>)}
        <button className="add">＋　{fa ? "افزودن صحنه" : "Add scene"}</button>
        <div className="hint">✧ {fa ? "قالب‌های آموزشی برای تولید سریع ویدیوهای معماری نرم‌افزار" : "Reusable templates for software engineering lessons"}</div>
      </section>
      <section className="editor">
        <div className="editor-head"><div><small>SCENE PREVIEW</small><b>{scenes[active][1]}</b></div><span>16:9　　100%</span></div>
        <div className="stage"><div className="slide">
          <div className="slide-meta"><span>SOFTWARE ARCHITECTURE / 08</span><span>03 — 05</span></div>
          <div className="hero"><small>ARCHITECTURE PATTERN</small><h1>Modular<br/><i>Monolith</i></h1><p>One deployable unit.<br/>Clear boundaries. Independent modules.</p></div>
          <div className="diagram"><div>ORDER<small>Domain module</small></div><div className="focus">PAYMENT<small>Domain module</small></div><div>INVENTORY<small>Domain module</small></div></div>
          <div className="slide-meta footer"><span>ARCHITECTURE NOTES</span><span>DESIGN FOR CHANGE</span></div>
        </div></div>
        <div className="playback"><button>▶</button><span>00:35</span><div className="bar"><i/></div><span>02:22</span><small>{fa ? "پیش‌نمایش ثابت · بدون حرکت خودکار" : "Static preview · no auto motion"}</small></div>
        <div className="timeline-head"><div><small>SCENE SEQUENCE</small><b>{fa ? "تایم‌لاین" : "Timeline"}</b></div><span>⌄</span></div>
        <div className="timeline"><div className="ruler"><span>00:00</span><span>00:30</span><span>01:00</span><span>01:30</span><span>02:00</span></div><div className="clips">{scenes.map((s,i)=><button key={s[0]} onClick={()=>setActive(i)} className={active===i?"clip on":"clip"}>{s[1]}</button>)}</div><div className="track"><b>♫　Voice-over</b><div className="wave">{Array.from({length:65},(_,i)=><i key={i} style={{height:(7+(i*13)%18)+"px"}}/>)}</div></div><div className="track"><b>▤　Captions</b><span className="caption">A modular monolith</span><span className="caption">Clear boundaries</span></div></div>
      </section>
      <aside className="inspector">
        <small>PROPERTIES</small><h2>{fa ? "بازرس صحنه" : "Scene inspector"}</h2>
        <nav>{[["design",fa?"طراحی":"Design"],["motion",fa?"حرکت":"Motion"],["audio",fa?"صدا":"Audio"],["timing",fa?"زمان":"Timing"]].map(([k,v])=><button className={tab===k?"chosen":""} onClick={()=>setTab(k)} key={k}>{v}</button>)}</nav>
        {tab==="design"?<><h3>{fa?"محتوای صحنه":"Scene content"}</h3><label>{fa?"عنوان":"Title"}</label><div className="field">{scenes[active][1]}</div><label>{fa?"نوع صحنه":"Scene type"}</label><div className="field">{scenes[active][2]}</div><h3>{fa?"قالب بصری":"Visual style"}</h3><div className="swatches"><i/><i/><i/><i/></div><label>{fa?"پس‌زمینه":"Background"}</label><div className="field">#111827</div><h3>{fa?"لایه‌ها":"Layers"}</h3><div className="layer">▤　Headline <em>Visible</em></div><div className="layer">⌘　Architecture diagram <em>Visible</em></div><div className="layer">▤　Captions <em>Visible</em></div></>:<><h3>{tab==="motion"?"Motion controls":tab==="audio"?"Audio settings":"Scene timing"}</h3><p className="muted">{tab==="motion"?"No animation is applied by default. Choose a motion preset explicitly.":"Controls for this section will be enabled in the next implementation milestone."}</p></>}
        <div className="note">✧ {fa?"حرکت فقط با انتخاب شما اعمال می‌شود؛ محتوای ثابت بدون زوم و پن می‌ماند.":"Motion is opt-in. Static content never auto-zooms or pans."}</div>
      </aside>
    </main>
  </div>;
}
