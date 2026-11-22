export default function ContactInput({ onChange, ...props }) {
  return <input
    {...props}
    placeholder="09XXXXXXXXX"
    type="tel"
    inputMode="numeric"
    autoComplete="tel-national"
    required
    minLength={11}
    maxLength={11}
    pattern="[0-9]{11}"
    title="Enter exactly 11 digits."
    onChange={(event) => {
      event.currentTarget.setCustomValidity("");
      onChange(event);
    }}
    onPaste={(event) => {
      const input = event.currentTarget;
      const pasted = event.clipboardData.getData("text");
      const combined = input.value.slice(0, input.selectionStart ?? 0) + pasted +
        input.value.slice(input.selectionEnd ?? input.value.length);
      if (combined.length <= 11 && !/[^0-9]/.test(combined)) {
        input.setCustomValidity("");
        return;
      }
      event.preventDefault();
      input.setCustomValidity("Enter exactly 11 digits. Check the number you pasted.");
      input.reportValidity();
    }}
  />;
}
