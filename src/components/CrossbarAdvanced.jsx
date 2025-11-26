import React, { useMemo, useState } from "react";

/**
 * CrossbarAdvanced
 * Props:
 *  - rows (number) : number of wordlines
 *  - cols (number) : number of bitlines
 *  - initial (optional) : initial matrix state array of size rows x cols with objects {state: "RON"|"ROFF", selector:true|false}
 *
 * Behavior:
 *  - Each cell has RON/ROFF (hardcoded default values) and a selector.
 *  - Drive WLs by toggling WL drive checkboxes (applies Vdrive to that WL; non-driven WLs are float 0).
 *  - Each BL is treated as a reference node (here we show currents into each BL).
 *  - Cell current approximated as I = (V_WL - V_BL) * G where G = 1/R (RON or ROFF) if selector enabled, else 0.
 *  - We compute V_BL by assuming BL is pulled to a fixed reference (0V) — this is a simple model but shows sneak paths:
 *      - currents from any driven WL to any BL flow through cells directly to that BL.
 *      - sneak paths arise because non-intended cells (driven WL to other BLs) produce currents that contribute to BL totals.
 *
 * Visuals:
 *  - Each cell shows logic (1/0) and color: green = RON (low R), blue = ROFF (high R), gray when selector=off.
 *  - Currents are shown as small numeric labels per BL and arrows on cells with non-zero current.
 *
 * This is a visualization/educational model (not SPICE). It highlights where sneak currents will appear.
 */

const RON = 2000.0;   // Ohms (example)
const ROFF = 40000.0; // Ohms (example)
const DEFAULT_VDRIVE = 1.0; // Volts applied to driven WLs

export default function CrossbarAdvanced({ rows = 3, cols = 3, initial }) {
  // initialize matrix
  const makeInitial = () => {
    if (initial && initial.length === rows && initial[0].length === cols) return initial;
    const m = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push({ state: "ROFF", selector: true }); // default ROFF (0)
      }
      m.push(row);
    }
    return m;
  };

  const [matrix, setMatrix] = useState(makeInitial());
  const [drivenWL, setDrivenWL] = useState(Array(rows).fill(false));
  const [vDrive, setVDrive] = useState(DEFAULT_VDRIVE);
  const [groundBLIndex, setGroundBLIndex] = useState(0); // which BL is ground reference (visual only)

  // compute per-cell conductance (S) and currents (A)
  const sim = useMemo(() => {
    // Build per-cell conductance G (S)
    const G = new Array(rows).fill(0).map(() => new Array(cols).fill(0));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = matrix[r][c];
        if (!cell.selector) {
          G[r][c] = 0;
        } else {
          const R = cell.state === "RON" ? RON : ROFF;
          G[r][c] = 1.0 / R;
        }
      }
    }

    // For simplicity: assume BLs are at 0V (grounded) and driven WLs at vDrive
    // Compute currents from each WL to each BL: I_rc = (Vwl - Vbl) * G_rc
    const I = new Array(rows).fill(0).map(() => new Array(cols).fill(0));
    const BL_total = new Array(cols).fill(0);

    for (let r = 0; r < rows; r++) {
      const Vwl = drivenWL[r] ? vDrive : 0;
      for (let c = 0; c < cols; c++) {
        const Vbl = 0; // simple reference
        const Irc = (Vwl - Vbl) * G[r][c]; // A
        I[r][c] = Irc;
        BL_total[c] += Irc;
      }
    }

    // measure sneak contribution: for each driven WL, currents into non-target BLs are sneaks if target BL different.
    // We don't have a single target per WL in this demo; we highlight cells with significant current relative to max.
    let maxI = 0;
    for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) if (Math.abs(I[r][c])>maxI) maxI = Math.abs(I[r][c]);

    return { G, I, BL_total, maxI };
  }, [matrix, drivenWL, vDrive, rows, cols]);

  // toggle cell logic (RON <-> ROFF)
  function toggleCellState(r,c){
    setMatrix(prev => {
      const copy = prev.map(row => row.map(cell => ({...cell})));
      copy[r][c].state = copy[r][c].state === "RON" ? "ROFF" : "RON";
      return copy;
    });
  }

  // toggle selector
  function toggleSelector(r,c){
    setMatrix(prev => {
      const copy = prev.map(row => row.map(cell => ({...cell})));
      copy[r][c].selector = !copy[r][c].selector;
      return copy;
    });
  }

  function toggleWL(r){
    setDrivenWL(prev => {
      const copy = [...prev];
      copy[r] = !copy[r];
      return copy;
    });
  }

  // helper for color classes
  const cellClass = (r,c) => {
    const cell = matrix[r][c];
    if (!cell.selector) return "bg-gray-800 border-gray-700 text-gray-300";
    if (cell.state === "RON") return "bg-green-500 text-black border-green-400";
    if (cell.state === "ROFF") return "bg-blue-600 text-white border-blue-400";
    return "bg-purple-500 text-white";
  };

  return (
    <div className="w-full mt-6">
      <h2 className="text-xl font-bold mb-3">Realistic Crossbar (WL × BL) — Advanced</h2>

      <div className="mb-3 flex items-center gap-4 text-sm">
        <div>
          <label className="mr-2">Drive voltage (V):</label>
          <input type="number" step="0.1" value={vDrive} onChange={e=>setVDrive(Number(e.target.value)||0)} className="w-20 p-1 rounded bg-[#071129]"/>
        </div>

        <div>
          <label className="mr-2">Ground BL index:</label>
          <select value={groundBLIndex} onChange={e=>setGroundBLIndex(Number(e.target.value))} className="p-1 rounded bg-[#071129]">
            {Array.from({length: cols}).map((_,i)=><option key={i} value={i}>BL{i}</option>)}
          </select>
        </div>

        <div className="text-xs text-gray-300">
          <strong>Note:</strong> This is a simplified educational current model (I = (Vwl - Vbl) / Rcell).
        </div>
      </div>

      <div className="flex gap-6">
        {/* WL controls */}
        <div className="flex flex-col gap-2">
          {Array.from({length: rows}).map((_, r) => (
            <label key={r} className={`flex items-center gap-2 text-sm ${drivenWL[r] ? 'text-emerald-300' : 'text-gray-300'}`}>
              <input type="checkbox" checked={drivenWL[r]} onChange={()=>toggleWL(r)} />
              WL{r} {drivenWL[r] ? `(V=${vDrive}V)` : `(float)`}
            </label>
          ))}
        </div>

        {/* Crossbar grid */}
        <div>
          <div style={{display: "grid", gridTemplateColumns: `120px repeat(${cols}, 60px)`}} className="gap-2">
            {/* header row */}
            <div className="text-xs text-gray-400 p-1"> </div>
            {Array.from({length: cols}).map((_,c)=>(
              <div key={c} className="text-center text-xs text-gray-200 p-1">BL{c}</div>
            ))}

            {/* rows */}
            {Array.from({length: rows}).map((_,r)=>(
              <React.Fragment key={r}>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold">WL{r}</div>
                </div>

                {Array.from({length: cols}).map((__,c)=> {
                  const cell = matrix[r][c];
                  const Irc = sim.I[r][c];
                  const arrow = Math.abs(Irc) > 1e-7 ? (Irc > 0 ? "→" : "←") : "";
                  return (
                    <div key={c} className="p-1">
                      <div className={`w-14 h-14 rounded-md border flex flex-col items-center justify-center text-xs ${cellClass(r,c)}`}>
                        <div className="font-bold">{cell.state === "RON" ? '1' : '0'}</div>
                        <div className="text-[10px]">{cell.selector ? '' : 'SEL off'}</div>
                      </div>

                      <div className="flex gap-1 mt-1 items-center justify-center">
                        <button className="text-[11px] px-1 py-0.5 rounded bg-[#0a1220]" onClick={()=>toggleCellState(r,c)}>Toggle R</button>
                        <button className="text-[11px] px-1 py-0.5 rounded bg-[#0a1220]" onClick={()=>toggleSelector(r,c)}>{cell.selector ? 'Sel:On' : 'Sel:Off'}</button>
                      </div>

                      <div className="text-[11px] text-center mt-1">
                        <div>{arrow}{Math.abs(Irc).toFixed(6)} A</div>
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          {/* BL totals */}
          <div className="mt-3 grid grid-cols-4 gap-2 text-sm">
            {sim.BL_total.map((v, idx) => (
              <div key={idx} className="p-2 rounded bg-[#071129]">
                <div className="text-xs">BL{idx} total I</div>
                <div className="font-mono font-semibold">{v.toExponential(3)} A</div>
                <div className="text-xs text-gray-400">Gsum: {sim.G.reduce((acc,row)=>acc+row[idx],0).toExponential(3)} S</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* sneak-path highlight */}
      <div className="mt-4 text-sm">
        <div className="font-medium mb-1">Sneak-path / hotspots</div>
        <div className="text-xs text-gray-300">
          Cells highlighted with non-zero arrow indicate current flow. Larger currents (relative) represent likely sneak/conduction paths.
        </div>
      </div>
    </div>
  );
}
