import React, { useEffect, useMemo, useState } from "react";
import { provider } from "../data";
export default function Users(){
  const [rows, setRows] = useState([]);
  useEffect(()=>{ provider.listUsers().then(setRows); },[]);
  return (
    <div>
      <h2>Users</h2>
      <pre>{JSON.stringify(rows, null, 2)}</pre>
    </div>
  );
}
