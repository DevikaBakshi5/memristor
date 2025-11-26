import React, {useState, useEffect, useRef} from 'react';
import CrossbarAdvanced from "./components/CrossbarAdvanced";

const DEFAULT_VDRIVE = 1.0; // volts, or whatever value you want
// Memristor resistance values (Ohms)
const RON = 1e3;    // Low resistance state (1)
const ROFF = 1e6;   // High resistance state (0)

// Memristor Logic Gates — Interactive Demo (single-file React component)
// Default export: App component
// Tailwind CSS utility classes assumed to be available in the host environment.

// -----------------------------------------------------------------------------
// NOTE about mMPU.h and your uploaded report:
// - You do NOT need the C header mMPU.h to run this web demo. The web demo
//   contains a JavaScript "mMPU" simulator module (pure JS) that mimics the
//   behavior of the mMPU instruction set (MNOT, MNOR, ISO, COM, etc.) used in
//   your thesis slides and report. This is sufficient for visualization and
//   educational reproducibility.
// - Your uploaded report is available at the local path: /mnt/data/Report.pdf
//   (you can link to or download it from the system that serves that path).
// -----------------------------------------------------------------------------




// --- Simple mMPU simulator (pure JS) ------------------------------------------------
// The simulator treats memristors as objects with a boolean state (LOW/high
// conductance -> logic 1, HIGH/low conductance -> logic 0). The simulator also
// simulates a small instruction set and pulse-driven updates.

const createMPUSimulator = () => {
  // memristor row/col store as Map of id -> {state: 0|1, history: []}
  const memristors = new Map();

  function makeId(r, c) { return `m-${r}-${c}`; }

  function ensure(r, c) {
    const id = makeId(r, c);
    if (!memristors.has(id)) memristors.set(id, {state: 0, history: []});
    return memristors.get(id);
  }

  // Basic operations (high-level emulation)
  // MNOT: toggles a target memristor (for demo we invert)
  function MNOT(target) {
    const m = ensure(target.r, target.c);
    m.state = m.state ? 0 : 1;
    m.history.push({op: 'MNOT', t: Date.now(), val: m.state});
    return m.state;
  }

  // MNOR: for demo, set target = !(a || b)
  function MNOR(target, a, b) {
    const ma = ensure(a.r, a.c).state;
    const mb = ensure(b.r, b.c).state;
    const res = (ma || mb) ? 0 : 1;
    const m = ensure(target.r, target.c);
    m.state = res;
    m.history.push({op: 'MNOR', t: Date.now(), val: m.state, a: ma, b: mb});
    return m.state;
  }

  // COM / ISO / JSET / JRES are control ops in mMPU; we emulate minimal behavior
  function COM() { /* combine/regulate - no-op in visual sim */ }
  function ISO() { /* isolate - no-op in visual sim */ }
  function JSET() { /* jump set - no-op */ }
  function JRES() { /* jump reset - no-op */ }

  function resetGrid(rows, cols) {
    memristors.clear();
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) ensure(r, c);
  }

  function setState(r, c, val) {
    const m = ensure(r, c);
    m.state = val ? 1 : 0;
    m.history.push({op: 'SET', t: Date.now(), val: m.state});
  }

  function getState(r, c) { return ensure(r,c).state; }

  function snapshot() {
    const out = {};
    for (const [k,v] of memristors) out[k] = {state: v.state};
    return out;
  }

  return {MNOT, MNOR, COM, ISO, JSET, JRES, resetGrid, setState, getState, snapshot};
};

// -----------------------------------------------------------------------------
// Gate definitions (mapping gate -> simulated instruction sequences and layout)
// We'll represent each gate as a tiny crossbar (2 inputs, 1 output) mapped to
// memristor cells. The visualization will show input memristors and output.
// -----------------------------------------------------------------------------

const GATES = {
  NOT: {
    name: 'NOT',
    description: 'Inverts the input: output = !A',
    // We'll map cell positions: input at (0,0), temp (0,1), output (0,2)
    layoutRows: 1,
    layoutCols: 3,
    instructionSequence: input => [
      {op: 'ISO', args: []},
      {op: 'MNOT', args: [{r:0,c:2}]}, // MNOT d[i], T5  (visual demo uses target)
    ],
    compute: (sim, inputs) => {
      // place input onto memristor (0,0)
      sim.setState(0,0, inputs.A ? 1 : 0);
      // apply MNOT to output cell
      sim.MNOT({r:0,c:2});
      return sim.getState(0,2);
    }
  },

  AND: {
    name: 'AND',
    description: 'A AND B',
    layoutRows: 1,
    layoutCols: 4,
    instructionSequence: input => [
      {op: 'ISO'},
      {op: 'MNOT', args: [{r:0,c:1}]},
      {op: 'MNOT', args: [{r:0,c:2}]},
      {op: 'MNOR', args: [{r:0,c:3}, {r:0,c:1}, {r:0,c:2}]},
    ],
    compute: (sim, inputs) => {
      sim.setState(0,0, inputs.A ? 1 : 0);
      sim.setState(0,1, inputs.B ? 1 : 0);
      // For demo, compute AND: A & B -> output
      const out = (inputs.A && inputs.B) ? 1 : 0;
      sim.setState(0,3, out);
      return sim.getState(0,3);
    }
  },

  OR: {
    name: 'OR',
    description: 'A OR B',
    layoutRows: 1,
    layoutCols: 4,
    instructionSequence: input => [
      {op: 'ISO'},
      {op: 'MNOR', args: [{r:0,c:3}, {r:0,c:0}, {r:0,c:1}]},
      {op: 'MNOT', args: [{r:0,c:3}]},
    ],
    compute: (sim, inputs) => {
      sim.setState(0,0, inputs.A ? 1 : 0);
      sim.setState(0,1, inputs.B ? 1 : 0);
      const out = (inputs.A || inputs.B) ? 1 : 0;
      sim.setState(0,3, out);
      return sim.getState(0,3);
    }
  },

  NAND: {
    name: 'NAND',
    description: 'NOT (A AND B)',
    layoutRows: 1,
    layoutCols: 5,
    instructionSequence: input => [
      {op: 'ISO'},
      {op: 'MNOT', args: [{r:0,c:1}]},
      {op: 'MNOT', args: [{r:0,c:2}]},
      {op: 'MNOR', args: [{r:0,c:3}, {r:0,c:1}, {r:0,c:2}]},
      {op: 'MNOT', args: [{r:0,c:4}]},
    ],
    compute: (sim, inputs) => {
      const and = (inputs.A && inputs.B) ? 1 : 0;
      sim.setState(0,4, and ? 0 : 1);
      return sim.getState(0,4);
    }
  },

  XOR: {
    name: 'XOR',
    description: '(A XOR B)',
    layoutRows: 2,
    layoutCols: 4,
    instructionSequence: input => [
      {op: 'ISO'},
      // XOR implemented by combination in memristor pattern
      {op: 'MNOR'}, {op: 'MNOT'}, {op: 'COM'}
    ],
    compute: (sim, inputs) => {
      const out = (inputs.A ^ inputs.B) ? 1 : 0;
      sim.setState(0,3, out);
      return sim.getState(0,3);
    }
  },

  XNOR: {
    name: 'XNOR',
    description: 'NOT (A XOR B)',
    layoutRows: 2,
    layoutCols: 4,
    instructionSequence: input => [ {op:'ISO'}, {op:'MNOR'}, {op:'MNOT'}, {op:'COM'} ],
    compute: (sim, inputs) => {
      const out = (inputs.A ^ inputs.B) ? 0 : 1;
      sim.setState(0,3, out);
      return sim.getState(0,3);
    }
  }
};

// Pre-populated comparison stats (from your slides/tables). These are present
// in the slides and report; they are embedded here to allow the demo to show
// energy/cycle/thermal comparisons. (Numbers are illustrative and pulled from
// your thesis slides: energy in nJ, cycles, temp rise (°C)).
const COMPARISON_STATS = {
  NOT: {cpuEnergy: 4.7e6, pimEnergy: 2.3e3, cpuCycles:55, pimCycles:6, cpuTemp:15.2, pimTemp:0.8},
  AND: {cpuEnergy: 6.8e6, pimEnergy: 6.8e3, cpuCycles:79, pimCycles:18, cpuTemp:18.5, pimTemp:1.5},
  OR: {cpuEnergy: 6.3e6, pimEnergy: 4.5e3, cpuCycles:73, pimCycles:12, cpuTemp:17.1, pimTemp:1.2},
  NAND: {cpuEnergy: 7.3e6, pimEnergy:9.1e3, cpuCycles:85, pimCycles:24, cpuTemp:19.8, pimTemp:2.4},
  XOR: {cpuEnergy: 8.4e6, pimEnergy:1.4e4, cpuCycles:97, pimCycles:36, cpuTemp:22.4, pimTemp:3.8},
  XNOR: {cpuEnergy: 6.3e6, pimEnergy:1.6e4, cpuCycles:73, pimCycles:42, cpuTemp:16.9, pimTemp:4.2}
};

// -----------------------------------------------------------------------------
// Visual components
// -----------------------------------------------------------------------------

function MemristorCell({r,c, state, onClick, id}){
  // state: 0 or 1
  return (
    <div
      onClick={onClick}
      className={`w-12 h-12 rounded-md flex items-center justify-center border select-none cursor-pointer transform transition-all duration-150 ${state? 'scale-105 border-green-400 bg-green-800' : 'border-gray-600 bg-gray-900'}`}
      title={`${id} — ${state ? 'Low resistance (1)' : 'High resistance (0)'}`}
    >
      <div className="text-xs opacity-90">{state ? '1' : '0'}</div>
    </div>
  );
}

function GridVisualizer({rows, cols, snapshot, onToggle}){
  const cells = [];
  for (let r=0; r<rows; r++){
    const row = [];
    for (let c=0; c<cols; c++){
      const id = `m-${r}-${c}`;
      const s = snapshot[id] ? snapshot[id].state : 0;
      row.push(<MemristorCell key={id} id={id} r={r} c={c} state={s} onClick={() => onToggle(r,c)} />);
    }
    cells.push(<div key={`row-${r}`} className="flex gap-2">{row}</div>);
  }
  return <div className="space-y-2">{cells}</div>;
}

// -----------------------------------------------------------------------------
// Main App
// -----------------------------------------------------------------------------

export default function App(){
  const [selectedGate, setSelectedGate] = useState('NOT');
  const [inputs, setInputs] = useState({A:0, B:0});
  const [sim] = useState(createMPUSimulator());
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(4);
  const [snapshot, setSnapshot] = useState({});
  const [output, setOutput] = useState(null);
  // --- Crossbar 2×2 visual matrix (your new structure) ---
  // --- realistic 4x4 crossbar state (1T1R style)
const [crossbar, setCrossbar] = useState(() => {
  const m = [];
  for (let r = 0; r < 4; r++) {
    const row = [];
    for (let c = 0; c < 4; c++) {
      row.push({ state: "ROFF", selector: true });
    }
    m.push(row);
  }
  return m;
});

// which WLs are currently driven (visual only)
const [drivenWL, setDrivenWL] = useState([false, false, false, false]);
const [vDrive, setVDrive] = useState(DEFAULT_VDRIVE);

// advanced sim results (currents per cell and BL totals)
const [advancedSim, setAdvancedSim] = useState({
  currents: Array.from({ length: 4 }, () => Array(4).fill(0)),
  blTotals: Array(4).fill(0),
});
/*
const [crossbar, setCrossbar] = useState([
  [
    { logic: 0, state: "ROFF" },
    { logic: 0, state: "ROFF" },
  ],
  [
    { logic: 0, state: "ROFF" },
    { logic: 0, state: "ROFF" },
  ]
]);
*/
  const [instructionLog, setInstructionLog] = useState([]);
  const [showStats, setShowStats] = useState(true);

  // initialize grid when gate changes
  useEffect(()=>{
    const g = GATES[selectedGate];
    setRows(g.layoutRows);
    setCols(g.layoutCols);
    sim.resetGrid(g.layoutRows, g.layoutCols);
    setSnapshot(sim.snapshot());
    setInstructionLog([]);
    setOutput(null);
  }, [selectedGate, sim]);

useEffect(() => {
  // Auto-run whenever inputs or gate changes
  const gate = selectedGate;
  const A = inputs.A;
  const B = inputs.B;

  // compute output
  const out = computeTruth(gate, A, B);
  setOutput(out);

  // update your 2x2 crossbar matrix
  updateCrossbar(gate, A, B, out);
}, [selectedGate, inputs]);


  useEffect(() => {
  // Mapping per your slides/report:
  // WL0 = A, WL1 = B, WL2 = GND/reference, WL3 = program/bias (unused for read)
  const A = inputs.A ? 1 : 0;
  const B = inputs.B ? 1 : 0;
  // drivenWL: only WL0 and WL1 driven for read (program WLs remain false)
  const newDriven = [!!A, !!B, false, false];
  setDrivenWL(newDriven);

  // build G matrix
  const G = Array.from({ length: 4 }, () => Array(4).fill(0));
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const cell = crossbar[r][c];
      if (!cell.selector) G[r][c] = 0;
      else G[r][c] = 1.0 / (cell.state === 'RON' ? RON : ROFF);
    }
  }

  // compute currents I_rc = (Vwl - Vbl) * G_rc ; we use Vbl=0 simplified read model
  const currents = Array.from({ length: 4 }, () => Array(4).fill(0));
  const blTotals = Array(4).fill(0);
  for (let r = 0; r < 4; r++) {
    const Vwl = newDriven[r] ? vDrive : 0;
    for (let c = 0; c < 4; c++) {
      const Irc = (Vwl - 0) * G[r][c];
      currents[r][c] = Irc;
      blTotals[c] += Irc;
    }
  }

  // basic read threshold: if BL0 current > threshold => logic 1
  const threshold = (vDrive / RON) * 0.35; // adjust as needed
  const out = blTotals[0] > threshold ? 1 : 0;
  setOutput(out);

  setAdvancedSim({ currents, blTotals });
}, [inputs, crossbar, vDrive]);


  function toggleInput(name){
    setInputs(prev => ({...prev, [name]: prev[name] ? 0 : 1}));
  }
/*
  function runGate(){
    const gate = GATES[selectedGate];
    // populate inputs into fixed cells. For simple mapping, A->(0,0), B->(0,1)
    sim.resetGrid(gate.layoutRows, gate.layoutCols);
    sim.setState(0,0, inputs.A ? 1 : 0);
    if ('B' in inputs) sim.setState(0,1, inputs.B ? 1 : 0);

    // run compute (which updates output memristor cell(s))
    const out = gate.compute(sim, inputs);
    setOutput(out);

    // instruction log: show the instructionSequence where we substitute inputs
    const seq = gate.instructionSequence(inputs).map((ins, idx) => ({idx, ...ins}));
    setInstructionLog(seq);
    setSnapshot(sim.snapshot());
  }
*/
/*
  function runGate(){
  const gate = GATES[selectedGate];

  // optionally show mMPU instruction pulses: for logical demo, drive WL0 for A and WL1 for B
  // map inputs to WL indices (WL0=A, WL1=B)
  const pulseList = [];
  if (inputs.A) pulseList.push(0);
  if (inputs.B) pulseList.push(1);
  if (pulseList.length) pulseWLs(pulseList, 350);

  sim.resetGrid(gate.layoutRows, gate.layoutCols);
  sim.setState(0,0, inputs.A ? 1 : 0);
  if ('B' in inputs) sim.setState(0,1, inputs.B ? 1 : 0);

  const out = gate.compute(sim, inputs);
  setOutput(out);

  // update instruction display
  const seq = gate.instructionSequence(inputs).map((ins, idx) => ({ idx, ...ins }));
  setInstructionLog(seq);
  setSnapshot(sim.snapshot());
}
*/

async function runGate() {
  const gate = GATES[selectedGate];
  sim.resetGrid(gate.layoutRows, gate.layoutCols);
  sim.setState(0,0, inputs.A ? 1 : 0);
  if ('B' in inputs) sim.setState(0,1, inputs.B ? 1 : 0);

  const instructions = gate.instructionSequence(inputs);
  
  for (let idx = 0; idx < instructions.length; idx++) {
    const ins = instructions[idx];
    
    // Execute instruction
    switch(ins.op){
      case 'MNOT': sim.MNOT(ins.args[0]); break;
      case 'MNOR': sim.MNOR(ins.args[0], ins.args[1], ins.args[2]); break;
      case 'ISO': sim.ISO(); break;
      case 'COM': sim.COM(); break;
      case 'JSET': sim.JSET(); break;
      case 'JRES': sim.JRES(); break;
    }

    // Update snapshot & crossbar after this instruction
    setSnapshot(sim.snapshot());
    updateCrossbar(selectedGate, inputs.A, inputs.B, sim.getState(0,3)); // adapt output cell

    // Highlight instruction in log
    setInstructionLog(instructions.map((i,j)=> ({...i, active: j===idx})));

    // wait a short time for animation
    await new Promise(r => setTimeout(r, 350));
  }

  // Final output
  const out = sim.getState(0,3); // adapt per gate
  setOutput(out);
}


  function updateCrossbar(gate, A, B, output) {
  const newMatrix = [];
  for (let r = 0; r < 4; r++) {
    const row = [];
    for (let c = 0; c < 4; c++) {
      if (r === 0 && c === 0) row.push({ logic: A, state: A===1?"RON":"ROFF", selector:true });
      else if (r === 0 && c === 1) row.push({ logic: B, state: B===1?"RON":"ROFF", selector:true });
      else if (r === 1 && c === 0) row.push({ logic: output, state: output===1?"RON":"ROFF", selector:true });
      else row.push({ logic: " ", state: "INTER", selector:true }); // default filler
    }
    newMatrix.push(row);
  }
  setCrossbar(newMatrix);
}



  function toggleCell(r,c){
    // flip cell manually
    const cur = sim.getState(r,c);
    sim.setState(r,c, cur ? 0 : 1);
    setSnapshot(sim.snapshot());
  }


  // toggle memristor R state in the crossbar (RON <-> ROFF)
function toggleCrossbarState(r, c) {
  setCrossbar(prev => {
    const copy = prev.map(row => row.map(cell => ({ ...cell })));
    copy[r][c].state = copy[r][c].state === "RON" ? "ROFF" : "RON";
    return copy;
  });
}

// toggle selector (1T) on/off
function toggleSelector(r, c) {
  setCrossbar(prev => {
    const copy = prev.map(row => row.map(cell => ({ ...cell })));
    copy[r][c].selector = !copy[r][c].selector;
    return copy;
  });
}

// animate driving a set of WL indices for a short pulse (visual only)
function pulseWLs(indices = [], duration = 300) {
  setDrivenWL(prev => {
    const next = [...prev];
    indices.forEach(i => { if (i >= 0 && i < next.length) next[i] = true; });
    return next;
  });
  setTimeout(() => {
    setDrivenWL(prev => {
      const next = [...prev];
      indices.forEach(i => { if (i >= 0 && i < next.length) next[i] = false; });
      return next;
    });
  }, duration);
}


  const stats = COMPARISON_STATS[selectedGate];

  return (
    <div className="p-6 bg-[#071025] min-h-screen text-gray-100">
      <div className="max-w-5xl mx-auto bg-gradient-to-br from-[#071025] to-[#07142a] p-6 rounded-2xl shadow-2xl">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold">Memristor Logic Gates — Interactive Demo</h1>
            <p className="text-sm text-gray-400 mt-1">Visual simulator for memristor-based logic gates using an mMPU-like instruction set. Your report is available at <span className="font-mono text-xs text-emerald-300">/mnt/data/Report.pdf</span>.</p>
          </div>

          <div className="flex gap-2">
            <select className="bg-[#0b1220] p-2 rounded" value={selectedGate} onChange={e => setSelectedGate(e.target.value)}>
              {Object.keys(GATES).map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <button onClick={async () => { await runGate(); }} className="px-4 py-2 rounded bg-emerald-500 text-black font-semibold">Run</button>

            <button onClick={() => { sim.resetGrid(rows, cols); setSnapshot(sim.snapshot()); setInstructionLog([]); setOutput(null);} } className="px-3 py-2 rounded bg-gray-700">Reset</button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-12 gap-6">
          <div className="col-span-7 bg-[#07182a] p-4 rounded-lg">
            <h2 className="text-lg font-medium">Crossbar visualization</h2>
            <p className="text-xs text-gray-400 mt-1">Click any cell to toggle its memristance (visual/educational only).</p>
            <div className="mt-4">
  {/* mMPU Grid */}
<GridVisualizer rows={rows} cols={cols} snapshot={snapshot} onToggle={toggleCell} />

{/* Realistic WL×BL crossbar (live) */}
<div className="mt-6">
  <CrossbarAdvanced
    matrix={crossbar}
    drivenWL={drivenWL}
    vDrive={vDrive}
    currents={advancedSim.currents}
    blTotals={advancedSim.blTotals}
    onToggleCell={toggleCrossbarState}
    onToggleSelector={toggleSelector}
  />
</div>

  </div>
  {/* END ADD */}

            

            <div className="mt-4 flex gap-3">
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-500 rounded-full"></div><span className="text-xs">Low R (logic 1)</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-gray-700 rounded-full"></div><span className="text-xs">High R (logic 0)</span></div>
            </div>
          </div>

          <div className="col-span-5 bg-[#07182a] p-4 rounded-lg space-y-4">
            <div>
              <h3 className="font-medium">Inputs</h3>
              <div className="flex gap-3 mt-2">
                <label className="flex items-center gap-2"><input type="checkbox" checked={!!inputs.A} onChange={() => toggleInput('A')} /> A</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={!!inputs.B} onChange={() => toggleInput('B')} /> B</label>
              </div>
            </div>

            <div>
              <h3 className="font-medium">Output</h3>
              <div className="mt-2 text-2xl font-bold">{output === null ? '—' : output ? '1' : '0'}</div>
            </div>

            

            <div>
              <h3 className="font-medium">Instruction Sequence (mMPU-like)</h3>
              <div className="mt-2 bg-[#021025] p-3 rounded text-xs font-mono h-36 overflow-auto">
                {instructionLog.length === 0 ? <div className="text-gray-500">(instruction sequence will appear when you Run)</div> : (
                  <ol className="space-y-1">
                    {instructionLog.map(item => (
                      <li key={item.idx}>[{item.idx}] {item.op} {item.args ? JSON.stringify(item.args) : ''}</li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showStats} onChange={() => setShowStats(s => !s)} /> Show energy/cycle/thermal comparisons</label>
              {showStats && stats && (
                <div className="mt-2 text-xs bg-[#021025] p-3 rounded">
                  <div><strong>Gate:</strong> {selectedGate}</div>
                  <div className="mt-1">CPU energy: <span className="font-mono">{Number(stats.cpuEnergy).toExponential(2)} nJ</span></div>
                  <div>mMPU/PIM energy: <span className="font-mono">{Number(stats.pimEnergy).toExponential(2)} nJ</span></div>
                  <div className="mt-1">CPU cycles: {stats.cpuCycles} — PIM cycles: {stats.pimCycles}</div>
                  <div>CPU temp rise: {stats.cpuTemp} °C — PIM temp rise: {stats.pimTemp} °C</div>
                </div>
              )}
            </div>

          </div>
        </div>

        <div className="mt-6 bg-[#07182a] p-4 rounded-lg">
          <h3 className="font-medium">Truth Table</h3>
          <div className="mt-2 grid grid-cols-4 gap-2 text-sm">
            <div className="font-semibold">A</div>
            <div className="font-semibold">B</div>
            <div className="font-semibold">Output</div>
            <div className="font-semibold">Action</div>

            {[0,1].map(a => [0,1].map(b => (
              <React.Fragment key={`row-${a}-${b}`}>
                <div className="flex items-center justify-center">{a}</div>
                <div className="flex items-center justify-center">{b}</div>
                <div className="flex items-center justify-center">{computeTruth(selectedGate, a, b)}</div>
                <div className="flex items-center justify-center"><button className="px-2 py-1 text-xs rounded bg-gray-800" onClick={() => { setInputs({A:a,B:b}); setTimeout(runGate, 40); }}>Apply</button></div>
              </React.Fragment>
            ))) }
          </div>
        </div>

        <div className="mt-6 text-sm text-gray-400">
          <h4 className="font-medium">Notes</h4>
          <ul className="list-disc ml-5 mt-2 space-y-1">
            <li>This demo is an educational, browser-only emulator of the mMPU instruction model used in your thesis. It intentionally simplifies physical memristor dynamics to focus on logic functionality and visualization.</li>
            <li>For actual device-level simulation, use SPICE / Verilog-A models and the memristor models discussed in Zhang et al. (TCAS-I 2018), which is in your uploaded files.</li>
            <li>The report file path (on the runtime host) is: <span className="font-mono">/mnt/data/Report.pdf</span></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// small helper used inside App for truth table
function computeTruth(gate, a, b){
  switch(gate){
    case 'NOT': return a ? 0 : 1;
    case 'AND': return (a && b) ? 1 : 0;
    case 'OR': return (a || b) ? 1 : 0;
    case 'NAND': return (a && b) ? 0 : 1;
    case 'XOR': return (a ^ b) ? 1 : 0;
    case 'XNOR': return (a ^ b) ? 0 : 1;
    default: return '-';
  }
}

// End of file
