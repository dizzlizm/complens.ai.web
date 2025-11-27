import React from 'react';
import './ChatMessage.css';

const ChatMessage = ({ message }) => {
  const { role, content, usage } = message;

  return (
    <div className={`chat-message ${role}`}>
      <div className="message-header">
        <span className="message-role">
          {role === 'user' ? '👤 You' : '🤖 Claude Sonnet 4'}
        </span>
        {usage && (
          <span className="message-tokens">
            Tokens: {usage.total_tokens} ({usage.input_tokens} in / {usage.output_tokens} out)
          </span>
        )}
      </div>
      <div className="message-content">
        {content.split('\n').map((line, index) => (
          <p key={index}>{line || '\u00A0'}</p>
        ))}
      </div>
    </div>
  );
};

export default ChatMessage;
