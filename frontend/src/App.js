import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import ChatMessage from './components/ChatMessage';
import { sendMessage, getConversations } from './services/api';

function App() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    setError(null);

    // Add user message to UI immediately
    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // Send message to API
      const response = await sendMessage(userMessage, conversationId);

      // Update conversation ID if new
      if (!conversationId && response.conversationId) {
        setConversationId(response.conversationId);
      }

      // Add assistant response to messages
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: response.response,
          usage: response.usage,
        },
      ]);

    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message. Please try again.');
      // Remove user message if request failed
      setMessages(messages);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    setError(null);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Complens.ai</h1>
        <p>Powered by Claude Sonnet 4 via AWS Bedrock</p>
        <button onClick={handleNewConversation} className="new-conversation-btn">
          New Conversation
        </button>
      </header>

      <main className="chat-container">
        <div className="messages-container">
          {messages.length === 0 && (
            <div className="welcome-message">
              <h2>Welcome to Complens.ai</h2>
              <p>Start a conversation with Claude Sonnet 4</p>
              <div className="example-prompts">
                <p>Try asking:</p>
                <ul>
                  <li>"What can you help me with?"</li>
                  <li>"Explain quantum computing in simple terms"</li>
                  <li>"Help me write a Python function"</li>
                </ul>
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <ChatMessage key={index} message={message} />
          ))}

          {isLoading && (
            <div className="loading-indicator">
              <div className="loading-dots">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </div>
              <p>Claude is thinking...</p>
            </div>
          )}

          {error && (
            <div className="error-message">
              <p>{error}</p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="input-form">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type your message here..."
            disabled={isLoading}
            className="message-input"
          />
          <button type="submit" disabled={isLoading || !inputValue.trim()} className="send-button">
            Send
          </button>
        </form>

        {conversationId && (
          <div className="conversation-info">
            Conversation ID: {conversationId.substring(0, 8)}...
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
