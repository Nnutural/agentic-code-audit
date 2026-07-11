from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable

from .config import Settings


@dataclass
class LLMResponse:
    ok: bool
    content: str
    error: str = ""


class DeepSeekClient:
    """Minimal OpenAI-compatible chat client. DeepSeek is the default provider."""

    def __init__(self, settings: Settings):
        self.settings = settings

    @property
    def enabled(self) -> bool:
        return bool(self.settings.llm_api_key)

    def chat(self, system_prompt: str, user_prompt: str, timeout: int = 60) -> LLMResponse:
        if not self.enabled:
            return LLMResponse(ok=False, content="", error="LLM API key is not configured")
        return self._call_api(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            timeout,
        )

    def chat_with_context(
        self,
        messages: list[dict[str, str]],
        timeout: int = 90,
    ) -> LLMResponse:
        """Multi-turn conversation with full message history.

        *messages* is a list of dicts with "role" and "content" keys.
        Roles: "system", "user", "assistant".
        """
        if not self.enabled:
            return LLMResponse(ok=False, content="", error="LLM API key is not configured")
        return self._call_api(messages, timeout)

    def _call_api(self, messages: list[dict[str, str]], timeout: int) -> LLMResponse:
        url = self.settings.llm_base_url.rstrip("/") + "/chat/completions"
        payload = {
            "model": self.settings.llm_model,
            "messages": messages,
            "temperature": 0.1,
        }
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=data,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.settings.llm_api_key}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                body = json.loads(response.read().decode("utf-8"))
            content = body["choices"][0]["message"]["content"]
            return LLMResponse(ok=True, content=content)
        except (urllib.error.URLError, KeyError, json.JSONDecodeError, TimeoutError) as exc:
            return LLMResponse(ok=False, content="", error=str(exc))


# ---------------------------------------------------------------------------
# ReAct-style LLM Agent
# ---------------------------------------------------------------------------

@dataclass
class AgentTurn:
    """A single turn in the agent conversation."""
    thought: str = ""
    action: str = ""
    action_input: dict[str, Any] = field(default_factory=dict)
    observation: str = ""
    final_answer: str = ""


class LLMAgent:
    """ReAct-style agent loop backed by DeepSeekClient.

    The agent iterates: Thought → Action → Observation → (repeat)
    until it produces a Final Answer or hits max_turns.

    Usage:
        agent = LLMAgent(llm_client, SYSTEM_PROMPT, {"read_file": my_read_fn})
        result = agent.run("Analyze this codebase for vulnerabilities", max_turns=8)
    """

    def __init__(
        self,
        llm_client: DeepSeekClient,
        system_prompt: str,
        tools: dict[str, Callable[..., str]] | None = None,
    ):
        self.llm = llm_client
        self.tools = tools or {}
        self.history: list[dict[str, str]] = [
            {"role": "system", "content": system_prompt}
        ]
        self.turns: list[AgentTurn] = []

    def run(self, task: str, max_turns: int = 8) -> str:
        """Execute the agent loop. Returns the final answer text."""
        self.history.append({"role": "user", "content": task})

        for _ in range(max_turns):
            response = self.llm.chat_with_context(self.history, timeout=90)
            if not response.ok:
                return f"LLM_ERROR: {response.error}"

            text = response.content.strip()
            turn = self._parse_turn(text)
            self.turns.append(turn)

            # Check for final answer
            if turn.final_answer:
                self.history.append({"role": "assistant", "content": text})
                return turn.final_answer

            # Execute tool
            if turn.action and turn.action in self.tools:
                try:
                    obs = self.tools[turn.action](**turn.action_input)
                except Exception as exc:
                    obs = f"Tool error: {exc}"
                turn.observation = obs
                # Feed observation back
                self.history.append({"role": "assistant", "content": text})
                self.history.append(
                    {"role": "user", "content": f"Observation: {obs}"}
                )
            elif turn.action and turn.action not in self.tools:
                # Unknown tool — feed error back
                known = ", ".join(self.tools.keys())
                obs = f"Unknown tool '{turn.action}'. Available: {known}"
                turn.observation = obs
                self.history.append({"role": "assistant", "content": text})
                self.history.append(
                    {"role": "user", "content": f"Observation: {obs}"}
                )
            else:
                # No action and no final answer — LLM may be rambling, prompt for action
                self.history.append({"role": "assistant", "content": text})
                self.history.append(
                    {"role": "user", "content": "Please choose an Action or give a Final Answer."}
                )

        # Max turns reached — ask for final conclusion
        self.history.append(
            {"role": "user", "content": "Maximum turns reached. Provide your Final Answer now."}
        )
        response = self.llm.chat_with_context(self.history, timeout=60)
        if response.ok:
            turn = self._parse_turn(response.content.strip())
            if turn.final_answer:
                return turn.final_answer
            return response.content
        return f"LLM_ERROR: {response.error}"

    def _parse_turn(self, text: str) -> AgentTurn:
        """Parse Thought / Action / Action Input / Final Answer from LLM output."""
        turn = AgentTurn()

        # Extract Thought
        thought_m = re.search(r"Thought:\s*(.+?)(?=\n(?:Action|Final)|\Z)", text, re.S | re.I)
        if thought_m:
            turn.thought = thought_m.group(1).strip()

        # Extract Final Answer
        fa_m = re.search(r"Final Answer:\s*(.+)", text, re.S | re.I)
        if fa_m:
            turn.final_answer = fa_m.group(1).strip()
            return turn

        # Extract Action
        action_m = re.search(r"Action:\s*(\S+)", text, re.I)
        if action_m:
            turn.action = action_m.group(1).strip()

        # Extract Action Input (JSON block)
        ai_m = re.search(r"Action Input:\s*(\{.*?\})", text, re.S | re.I)
        if ai_m:
            try:
                turn.action_input = json.loads(ai_m.group(1))
            except json.JSONDecodeError:
                turn.action_input = {"raw": ai_m.group(1)}
        elif turn.action:
            # Try to find any JSON object after Action
            json_m = re.search(r"\{.*?\}", text, re.S)
            if json_m:
                try:
                    turn.action_input = json.loads(json_m.group(0))
                except json.JSONDecodeError:
                    pass

        return turn

    @property
    def transcript(self) -> str:
        """Return a human-readable transcript of the agent conversation."""
        lines: list[str] = []
        for i, turn in enumerate(self.turns, 1):
            lines.append(f"--- Turn {i} ---")
            if turn.thought:
                lines.append(f"Thought: {turn.thought}")
            if turn.action:
                lines.append(f"Action: {turn.action}({json.dumps(turn.action_input)})")
            if turn.observation:
                lines.append(f"Observation: {turn.observation[:500]}")
            if turn.final_answer:
                lines.append(f"Final Answer: {turn.final_answer[:1000]}")
        return "\n".join(lines)
