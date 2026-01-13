import { useAttr } from "../middleware/hooks/use-attr";
import React from "react";

type Props = {
  label?: string;
};

export function ImageWidget({ label }: Props) {

  const image = useAttr<number>("image");

  return (
    <div>
      {label && <div>{label}</div>}
      <img id="cam" style={{width: "500px"}} alt={"image"} src={`data:image/png;base64,${image}`}/>
    </div>)
}
