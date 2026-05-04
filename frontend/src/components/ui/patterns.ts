import { cva, type VariantProps } from "class-variance-authority"

export const panelSection = cva("section-panel", {
  variants: {
    animated: {
      true: "float-in",
      false: "",
    },
    stagger: {
      none: "",
      "1": "stagger-1",
      "2": "stagger-2",
      "3": "stagger-3",
      "4": "stagger-4",
      "5": "stagger-5",
      "6": "stagger-6",
      "7": "stagger-7",
      "8": "stagger-8",
    },
  },
  defaultVariants: {
    animated: false,
    stagger: "none",
  },
})

export type PanelSectionVariants = VariantProps<typeof panelSection>

export const innerCard = cva("inner-card")
export const insideCard = innerCard
