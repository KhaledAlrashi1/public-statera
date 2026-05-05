// Import only chart primitives we actually render.
// This avoids pulling the entire recharts index barrel into each route chunk.
import { BarChart } from "recharts/es6/chart/BarChart"
import { ComposedChart } from "recharts/es6/chart/ComposedChart"
import { LineChart } from "recharts/es6/chart/LineChart"
import { PieChart } from "recharts/es6/chart/PieChart"
import { Bar } from "recharts/es6/cartesian/Bar"
import { CartesianGrid } from "recharts/es6/cartesian/CartesianGrid"
import { Line } from "recharts/es6/cartesian/Line"
import { ReferenceLine } from "recharts/es6/cartesian/ReferenceLine"
import { XAxis } from "recharts/es6/cartesian/XAxis"
import { YAxis } from "recharts/es6/cartesian/YAxis"
import { Cell } from "recharts/es6/component/Cell"
import { Legend } from "recharts/es6/component/Legend"
import { ResponsiveContainer } from "recharts/es6/component/ResponsiveContainer"
import { Tooltip } from "recharts/es6/component/Tooltip"
import { Pie } from "recharts/es6/polar/Pie"

export {
  BarChart,
  ComposedChart,
  LineChart,
  PieChart,
  Bar,
  CartesianGrid,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  Pie,
}
