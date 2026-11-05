// The collection is the home screen now; keep the old route working.
import { Redirect } from 'expo-router';

export default function Collection() {
  return <Redirect href="/" />;
}
