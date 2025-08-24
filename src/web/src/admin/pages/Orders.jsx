import { useEffect, useState } from "react";
import React from "react";

import { provider } from "../data";
export default function Orders(){
  const [rows, setRows] = useState([]);
  useEffect(()=>{ provider.listOrders().then(setRows); },[]);
  return (
    <div>
      <h2>Orders</h2>
      <pre>{JSON.stringify(rows, null, 2)}</pre>
    </div>
  );
}
