import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The space manager — a first-party immediately.run system app (UI_AS_APPS_SPEC
// §5.2). Lists the user's spaces and manages membership (share/role/remove) via
// the elevated spaces:user + spaces:admin SDK. https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
});
