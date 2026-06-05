// Root component — immediately.run renders the default export of THIS file.
// The space manager as an app (UI_AS_APPS_SPEC §5.2): lists the user's spaces,
// and for spaces they own, manages membership — invite by handle, change roles,
// remove members. Elevated `spaces:user` (enumerate) + `spaces:admin` (mutate).
// The host enforces the owner-lockout invariant and owns the handle lookup; the
// identity token never reaches this app.
import "./index.css";
import SpaceManager from "./components/SpaceManager";

function App() {
  return <SpaceManager />;
}

export default App;
