import { deploymentIssues } from "../lib/server/deployment";

// Does not load .env.local or contact a remote service.
const issues = deploymentIssues();
if (issues.length) {
  console.error("Configuração de publicação incompleta:");
  for (const issue of issues)
    console.error(`- ${issue.field}: ${issue.message}`);
  process.exitCode = 1;
} else {
  console.log(
    "Configuração estrutural aprovada. Pagamentos desabilitados. Verifique banco e Auth conforme docs/DEPLOYMENT.md.",
  );
}
