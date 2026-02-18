"""
Standard-Specific Agents for EB-1A Multi-Agent Pipeline

Each agent is responsible for validating evidence against a specific EB-1A criterion
using the legal definition from 8 C.F.R. §204.5(h)(3).
"""

from .leading_role_agent import LeadingRoleAgent, validate_leading_role_evidence

__all__ = [
    "LeadingRoleAgent",
    "validate_leading_role_evidence",
]
