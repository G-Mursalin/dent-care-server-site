const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

//MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.a1mho.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// All operations
async function run() {
  try {
    await client.connect();
    const serviceCollection = client.db("dent_care").collection("services");
    // Get all services
    app.get("/services", async (req, res) => {
      const services = await serviceCollection.find().toArray();
      res.send(services);
    });
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World from Dent Care");
});

app.listen(port, () => {
  console.log(`Dent Care app listening on port ${port}`);
});
