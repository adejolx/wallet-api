import app from "./app.js";
import { parsePort } from "./config.js";

const port = parsePort(process.env.PORT);

app.listen(port, () => console.log(`Server is listening on port ${port}`));
