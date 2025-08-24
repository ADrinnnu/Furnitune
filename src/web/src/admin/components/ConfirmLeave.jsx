import { useEffect } from "react";

export default function ConfirmLeave({ when }) {
  useEffect(() => {
    const handler = (e) => {
      if (when) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [when]);

  return null;
}
