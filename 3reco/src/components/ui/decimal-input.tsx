import * as React from "react"

import { Input } from "@/components/ui/input"

function DecimalInput({
  ...props
}: Omit<React.ComponentProps<typeof Input>, "inputMode" | "type">) {
  return <Input type="text" inputMode="decimal" {...props} />
}

export { DecimalInput }
