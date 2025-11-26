import React from "react";

export default function Crossbar({ matrix }) {
  return (
    <div className="w-full mt-6">
      <h2 className="text-xl font-bold mb-3">Memristor Crossbar Visualization</h2>

      <div className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${matrix[0].length}, 50px)` }}>
        
        {matrix.flat().map((cell, index) => (
          <div 
            key={index}
            className={`
              w-12 h-12 flex items-center justify-center rounded-md border
              ${cell.state === "RON" ? "bg-green-500 text-white" : ""}
              ${cell.state === "ROFF" ? "bg-blue-600 text-white" : ""}
              ${cell.state === "INTER" ? "bg-purple-500 text-white" : ""}
            `}
          >
            {cell.logic}
          </div>
        ))}
      </div>
    </div>
  );
}
