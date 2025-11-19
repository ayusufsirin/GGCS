
import {useServiceCall} from "../middleware/hooks/use-service";
import React from "react";

type Props = {
    buttonLabel?: string;
    buttonPendingLabel?: string;
    requestParams?: Record<string, any>;
};

export function ServiceWidget({
    buttonLabel = "Call Service",
    buttonPendingLabel = "Calling...",
    requestParams = {}
}: Props) {
    const {call: callService, pending} = useServiceCall<any, any>("callService");

    const handleClick = () => {
        callService(requestParams);
    };

    return (
        <button disabled={pending} onClick={handleClick}>
            {pending ? buttonPendingLabel : buttonLabel}
        </button>
    );
}
