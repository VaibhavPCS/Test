import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import { gql } from 'graphql-tag';
import http from 'http';
import cors from 'cors';

// Sample data (replace with your database)
let users = [
  { id: '1', name: 'Alice', email: '[email protected]' },
  { id: '2', name: 'Bob', email: '[email protected]' }
];

// GraphQL Schema
const typeDefs = gql`
  type User {
    id: ID!
    name: String!
    email: String!
  }

  input UserInput {
    name: String!
    email: String!
  }

  type Query {
    users: [User]
    user(id: ID!): User
  }

  type Mutation {
    createUser(input: UserInput!): User
    updateUser(id: ID!, input: UserInput!): User
    deleteUser(id: ID!): Boolean
  }
`;

// GraphQL Resolvers
const resolvers = {
  Query: {
    users: () => users,
    user: (_, { id }) => users.find(u => u.id === id)
  },
  Mutation: {
    createUser: (_, { input }) => {
      const user = { id: String(users.length + 1), ...input };
      users.push(user);
      return user;
    },
    updateUser: (_, { id, input }) => {
      const index = users.findIndex(u => u.id === id);
      if (index !== -1) {
        users[index] = { ...users[index], ...input };
        return users[index];
      }
      return null;
    },
    deleteUser: (_, { id }) => {
      const index = users.findIndex(u => u.id === id);
      if (index !== -1) {
        users.splice(index, 1);
        return true;
      }
      return false;
    }
  }
};

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  // Create Apollo Server
  const server = new ApolloServer({
    typeDefs,
    resolvers
  });

  await server.start();

  app.use(cors());
  app.use(express.json());

  // GraphQL endpoint
  app.use('/graphql', expressMiddleware(server));

  // REST endpoints (legacy)
  app.get('/api/users', (req, res) => {
    res.json(users);
  });

  app.get('/api/users/:id', (req, res) => {
    const user = users.find(u => u.id === req.params.id);
    res.json(user || { error: 'User not found' });
  });

  app.post('/api/users', (req, res) => {
    const user = { id: String(users.length + 1), ...req.body };
    users.push(user);
    res.status(201).json(user);
  });

  const PORT = 4000;
  await new Promise(resolve => httpServer.listen(PORT, resolve));
  
  console.log(`🚀 Server ready at http://localhost:${PORT}`);
  console.log(`📊 GraphQL: http://localhost:${PORT}/graphql`);
  console.log(`🔧 REST API: http://localhost:${PORT}/api`);
}

startServer();
