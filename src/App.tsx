import { AuthProvider } from "./login/AuthContext";
import ProtectedRoute from "./login/ProtectedRoute";
import DashboardLayout from "./layout/DashboardLayout";

function App() {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <DashboardLayout />
      </ProtectedRoute>
    </AuthProvider>
  );
}

export default App;
