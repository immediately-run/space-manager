// Root component: immediately.run renders the default export of this file.
// The space manager is one app bound at several regions; each region renders its own
// component, chosen here by the region the host reports.
import "./index.css";
import { useRegion } from "@immediately-run/sdk";
import { viewForRegion } from "./lib/regions";
import Inventory from "./regions/Inventory";
import Launcher from "./regions/Launcher";
import PanelSpaces from "./regions/PanelSpaces";

function App() {
  switch (viewForRegion(useRegion())) {
    case "launcher":
      return <Launcher />;
    case "panel":
      return <PanelSpaces fullTab={false} />;
    case "page":
      return <PanelSpaces fullTab />;
    case "inventory":
      return <Inventory />;
  }
}

export default App;
