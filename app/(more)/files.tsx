import { Redirect, type Href } from 'expo-router';

/**
 * `/files` bestaat niet meer als los scherm: het overzicht van foto's &
 * bestanden staat op de Database-pagina (tab "Foto's & bestanden"). Oude
 * links en bladwijzers komen daar terecht.
 */
export default function FilesRedirect() {
  // `as Href`: de getypte routes kennen `/database` pas na de volgende
  // generatie door de dev-server.
  return <Redirect href={'/database?weergave=fotos' as Href} />;
}
