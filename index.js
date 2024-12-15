import express from "express";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import cors from "cors";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const uri = process.env.uri;
const dbName = "examDB";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db;

// Connect to MongoDB
async function connectToDatabase() {
  try {
    // Connect the client to the server
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    // Set the database reference
    db = client.db(dbName);
  } catch (error) {
    console.error("Failed to connect to MongoDB", error);
  }
}

connectToDatabase();

// API Endpoint to handle publish
app.post("/api/exams", async (req, res) => {
  try {
    const { title, questions } = req.body;
    const exam = { title };
    const examResult = await db.collection("exams").insertOne(exam);

    const questionsWithExamId = questions.map((question) => ({
      ...question,
      examId: examResult.insertedId,
    }));

    const questionResults = await db
      .collection("questions")
      .insertMany(questionsWithExamId);

    res.status(201).json({
      message: "Exam and questions published successfully!",
      examId: examResult.insertedId,
      questionIds: questionResults.insertedIds,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to publish exam and questions" });
  }
});

// API Endpoint to get all questions
app.get("/api/questions", async (req, res) => {
  try {
    const questions = await db.collection("questions").find().toArray();
    res.status(200).json(questions);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch questions" });
  }
});

// API Endpoint to get question text by using question id
app.get("/api/questions/:id", async (req, res) => {
  try {
    const questionId = req.params.id;
    const question = await db
      .collection("questions")
      .findOne({ _id: new ObjectId(questionId) });

    if (question) {
      res.status(200).json(question);
    } else {
      res.status(404).json({ error: "Question not found" });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch question" });
  }
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// POST endpoint to submit answers
app.post("/api/submit-answers", async (req, res) => {
  try {
    const { answers } = req.body; 
    const userId = uuidv4(); // Generate a unique user ID

    const evaluationResults = [];

    for (const answer of answers) {
      const question = await db
        .collection("questions")
        .findOne({ _id: new ObjectId(answer.questionId) });

      const response = await fetch(
        "https://b93f-34-171-166-53.ngrok-free.app/evaluate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question: question.text,
            answer: answer.answer,
            teacher_answer: question.answer,
            keywords: question.keywords,
          }),
        }
      );
      console.log(response);
      if (!response.ok) {
        throw new Error("Failed to evaluate answer");
      }

      const evaluation = await response.json();
      evaluationResults.push({
        questionId: answer.questionId,
        userId,
        answer: answer.answer,
        submittedAt: new Date(),
        evaluation,
      });

      
      await delay(1000);
    }

    await db.collection("evaluations").insertMany(evaluationResults);

    res.status(201).json({
      message: "Answers submitted and evaluated successfully!",
      userId,
    });
  } catch (error) {
    console.error("Error submitting and evaluating answers:", error);
    res.status(500).json({ error: "Failed to submit and evaluate answers" });
  }
});

// API Endpoint to get submissions for a specific question
app.get("/api/submissions/:questionId", async (req, res) => {
  try {
    const questionId = req.params.questionId;
    const submissions = await db
      .collection("evaluations")
      .find({ questionId })
      .toArray();

    if (submissions.length > 0) {
      res.status(200).json(submissions);
    } else {
      res.status(404).json({ error: "No submissions found for this question" });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

// API Endpoint to get submissions for a specific exam and user ID
app.get("/api/studentResult/:examID/:userID", async (req, res) => {
  try {
    const { examID, userID } = req.params;
    const questions = await db
      .collection("questions")
      .find({ examId: new ObjectId(examID) })
      .toArray();
    const questionIds = questions.map((q) => q._id.toString());

    const studentResult = await db
      .collection("evaluations")
      .find({ userId: userID, questionId: { $in: questionIds } })
      .toArray();

    if (studentResult.length > 0) {
      res.status(200).json(studentResult);
    } else {
      res
        .status(404)
        .json({ error: "No student result found for this exam and userID" });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch student result" });
  }
});

app.get("/api/exams", async (req, res) => {
  try {
    const exams = await db.collection("exams").find().toArray();
    res.status(200).json(exams);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch exams" });
  }
});

app.get("/api/getQuestions", async (req, res) => {
  try {
    const { examId } = req.query;
    const query = examId ? { examId: new ObjectId(examId) } : {};
    const questions = await db.collection("questions").find(query).toArray();
    res.status(200).json(questions);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch questions" });
  }
});

app.post("/api/updateScores/:questionId", async (req, res) => {
  try {
    const { questionId } = req.params;
    const { keywordScore, relevanceScore, grammarScore } = req.body;
    const finalScore =
      parseInt(keywordScore) * 0.4 +
      parseInt(relevanceScore) * 0.4 +
      parseInt(grammarScore) * 0.2;
    const result = await db.collection("evaluations").updateOne(
      { questionId },
      {
        $set: {
          "evaluation.keyword.score": keywordScore,
          "evaluation.reference.score": relevanceScore,
          "evaluation.grammar.score": grammarScore,
          "evaluation.finalScore": finalScore,
        },
      }
    );
    console.log(result);

    if (result.modifiedCount > 0) {
      res.status(200).json({ message: "Scores updated successfully" });
    } else {
      res.status(404).json({ error: "Submission not found" });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to update scores" });
  }
});

// API Endpoint to get a specific exam by ID
app.get("/api/exams/:examID", async (req, res) => {
  try {
    const { examID } = req.params;
    const exam = await db
      .collection("exams")
      .findOne({ _id: new ObjectId(examID) });

    if (exam) {
      res.status(200).json(exam);
    } else {
      res.status(404).json({ error: "Exam not found" });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch exam" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
