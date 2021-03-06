

function isdigit(c)
{
	return c >= "0" && c <= "9";
}

function ishexdigit(c)
{
	return (c >= "A" && c <= "F") || (c >= "a" && c <= "f") || isdigit(c);
}

function isalpha(c)
{
	return (c >= "A" && c <= "Z") || (c >= "a" && c <= "z");
}

function isalnum(c)
{
	return isdigit(c) || isalpha(c);
}



// =====================================================================================================================
// Log/Warning/Error Reporter
// =====================================================================================================================



function dcpuReport()
{
	this.Content = [ ];

	this.Log = function(text, line)
	{
		this.Content.push([ text, line ]);
	}


	this.Error = function(text, line)
	{
		this.Log("ERROR -- " + text, line);
	}


	this.UnexpectedToken = function(token, line)
	{
		this.Error("Unexpected token '" + token + "'", line);
	}


	this.ExpectingToken = function(token, got, line)
	{
		this.Error("Expecting token '" + token + "' but got '" + got + "'", line);
	}
}



// =====================================================================================================================
// DCPU-16 Basics
// =====================================================================================================================



dcpuOpcodes = {

	// Basic opcodes
	NUL: 0x00,
	SET: 0x01,
	ADD: 0x02,
	SUB: 0x03,
	MUL: 0x04,
	DIV: 0x05,
	MOD: 0x06,
	SHL: 0x07,
	SHR: 0x08,
	AND: 0x09,
	BOR: 0x0A,
	XOR: 0x0B,
	IFE: 0x0C,
	IFN: 0x0D,
	IFG: 0x0E,
	IFB: 0x0F,

	// Non-basic opcodes
	JSR: 0x10000,

	// Not an opcode - purely here for the lexer
	DAT: 0xFFFFFFFF,
};


dcpuRegisters = {

	// Arithmetic registers
	A: 0x00,
	B: 0x01,
	C: 0x02,
	X: 0x03,
	Y: 0x04,
	Z: 0x05,
	I: 0x06,
	J: 0x07,

	// Control registers
	SP: 0x1B,
	PC: 0x1C,
	O:  0x1D,

	// Psuedo registers
	POP: 0x18,
	PEEK: 0x19,
	PUSH: 0x1A
};



// =====================================================================================================================
// Lexer for the DCPU Assembly Language
// =====================================================================================================================



var dcpuTokens = {

	INVALID:"INVALID",
	END:"END OF LINE",

	// Basic characters
	COLON:":",
	SEMICOLON:";",
	COMMA:",",
	LBRACKET:"[",
	RBRACKET:"]",
	PLUS:"+",

	// Keywords/text
	INSTRUCTION:"INSTRUCTION",
	REGISTER:"REGISTER",
	LABEL:"LABEL",

	// Values
	NUMBER:"NUMBER",
	STRING:"STRING"
};


function dcpuLexer(report)
{
	// Initialise defaults
	this.Report = report;
	this.Text = "";
	this.Length = 0;
	this.Pos = 0;
	this.Line = 0;


	this.SetText = function(text, line)
	{
		this.Text = text;
		this.Length = this.Text.length;
		this.Pos = 0;
		this.Line = line;
	}


	this.ParseNumber = function()
	{
		var number_text = "";

		// Skip the hex prefix
		var p = this.Pos;
		if (p + 2 <= this.Length)
		{
			if (this.Text[p] == "0" && this.Text[p + 1] == "x")
			{
				number_text = "0x";
				this.Pos += 2;
			}
		}

		// Pull together the text for the number
		while (this.Pos < this.Length)
		{
			var c = this.Text[this.Pos];
			if (!ishexdigit(c))
				break;
			number_text += c;
			this.Pos++;
		}

		// Check for parse errors before returning
		// NOTE: Not sure how to check for NaN - very dodgy code
		var num = parseInt(number_text);
		if (num.toString() == "NaN")
			return [ dcpuTokens.INVALID, null ];

		if (num > 0xFFFF)
		{
			this.Report.Error("Number '" + num + "' out of range", this.Line);
			return [ dcpuTokens.INVALID, null ];
		}

		return [ dcpuTokens.NUMBER, num ];
	}


	this.ParseString = function()
	{
		var text = "";

		// Skip entry
		this.Pos++;

		// Always increment parsing text to consume the closing quote
		var end = false;
		while (this.Pos < this.Length)
		{
			var c = this.Text[this.Pos++];
			if (c == '"')
			{
				end = true;
				break;
			}
			text += c;
		}

		if (end == false)
		{
			this.Report.Error("Unexpected end of file looking for string end", this.Line);
			return [ dcpuTokens.INVALID, null ];
		}

		return [ dcpuTokens.STRING, text ];
	}


	this.ParseText = function()
	{
		var text = this.Text[this.Pos++];

		// Parse the text, only incrementing on success
		while (this.Pos < this.Length)
		{
			var c = this.Text[this.Pos];
			if (!isalpha(c))
				break;
			text += c;
			this.Pos++;
		}

		// Promote all text to uppercase
		text = text.toUpperCase();

		// First check to see if the text is an instruction or register
		if (text in dcpuOpcodes)
			return [ dcpuTokens.INSTRUCTION, dcpuOpcodes[text] ];
		if (text in dcpuRegisters)
			return [ dcpuTokens.REGISTER, dcpuRegisters[text] ];

		return [ dcpuTokens.LABEL, text ];
	}


	this.NextToken = function()
	{
		while (this.Pos < this.Length)
		{
			var c = this.Text[this.Pos];
			switch (c)
			{
				// Basic character token values are the same as their characters
				case (":"):
				case (";"):
				case (","):
				case ("["):
				case ("]"):
				case ("+"):
					this.Pos++;
					return [ c, null ];

				case ('"'):
					return this.ParseString();
				
				default:

					// Skip whitespace
					if (c <= " ")
					{
						this.Pos++;
					}

					else if (isdigit(c))
					{
						return this.ParseNumber();
					}

					else if (isalpha(c))
					{
						return this.ParseText();
					}

					else
					{
						this.Report.Error("Invalid character '" + c + "'", this.Line);
						return [ dcpuTokens.INVALID, null ];
					}

			}
		}

		return [ dcpuTokens.END, null ];
	}


	this.ConsumeExpectToken = function(expected)
	{
		var token = this.NextToken();
		if (token[0] != expected)
		{
			this.Report.ExpectingToken(expected, token[0], this.Line);
			return false;
		}

		return true;
	}
}



// =====================================================================================================================
// DCPU-16 Assembly to Byte Code
// =====================================================================================================================



function dcpuAssembler(report)
{
	this.Report = report;
	this.Labels = { };
	this.LabelPatches = [ ];
	this.WordCode = [ ];
	this.Line = 0;


	this.AddLabelPatch = function(label, offset)
	{
		this.LabelPatches.push([ label, this.WordCode.length + offset, this.Line ]);
	}


	this.ParseLabel = function()
	{
		// Get the label name
		var token = this.Lexer.NextToken();
		if (token[0] != dcpuTokens.LABEL)
		{
			this.Report.ExpectingToken(dcpuTokens.LABEL, token[0], this.Line);
			return false;
		}

		this.Labels[token[1]] = this.WordCode.length;
	}


	this.ParseAddressArgument = function(extra_words)
	{
		//
		// Possibilities:
		//
		// Reg			-> 0x00-0x07 (and pseudo/ctrl)
		// Imm			-> 0x20-0x3f for 5-bit numbers or 0x1f + next word
		// Lbl			-> 0x1f + next word (5-bit numbers not allowed)
		// [Reg]		-> 0x08-0x0f (and pseudo/ctrl)
		// [Imm]		-> 0x1e + next word
		// [Lbl]		-> 0x1e + next word
		// [Imm+Reg]	-> 0x10-0x17 (pseudo/ctrl not allowed, value in next word)
		// [Lbl+Reg]	-> 0x10-0x17 (pseudo/ctrl not allowed, value in next word)
		//

		var token = this.Lexer.NextToken();
		var value = token[1];

		// Only arithmetic registers can be used as address operands
		if (token[0] == dcpuTokens.REGISTER)
		{
			if (value > 0x07)
			{
				this.Report.Error("Can't use register '" + value + "' as an address operand", this.Line);
				return [ false, 0 ];
			}

			// Also double-check that the closing token is the bracket
			return [ this.Lexer.ConsumeExpectToken(dcpuTokens.RBRACKET), 0x08 + value ];
		}

		// Either add an immediate or label patch
		if (token[0] == dcpuTokens.NUMBER)
		{
			extra_words.push(value);
		}
		else if (token[0] == dcpuTokens.LABEL)
		{
			this.AddLabelPatch(value, 1 + extra_words.length);
			extra_words.push(0);
		}
		else
		{
			this.Report.UnexpectedToken(token[0], this.Line);
			return [ false, 0 ];
		}

		// Leave if there's no offset
		token = this.Lexer.NextToken();
		if (token[0] == dcpuTokens.RBRACKET)
			return [ true, 0x1E ];

		// Parse the register offset
		if (token[0] == dcpuTokens.PLUS)
		{
			token = this.Lexer.NextToken();
			if (token[0] != dcpuTokens.REGISTER)
			{
				this.Report.ExpectingToken(dcpuTokens.REGISTER, token[0], this.Line);
				return [ false, 0 ];
			}

			// Only arithmetic registers can be used as address operands
			if (token[1] > 0x07)
			{
				this.Report.Error("Can't use register '" + token[1] + "' as an address operand", this.Line);
				return [ false, 0 ];
			}

			// Also double-check that the closing token is the bracket
			return [ this.Lexer.ConsumeExpectToken(dcpuTokens.RBRACKET), 0x10 + token[1] ];
		}

		this.Report.UnexpectedToken(token[0], this.Line);
		return [ false, 0 ];
	}


	this.ParseArgument = function(extra_words)
	{
		var token = this.Lexer.NextToken();
		var value = token[1];

		switch (token[0])
		{
			// Registers are simple!
			case (dcpuTokens.REGISTER):
				return [ true, value ];

			// 5-bit numbers can be compacted into the register details, otherwise they're in the next word
			case (dcpuTokens.NUMBER):
				// NOTE: Disabled for now as the emulator reads/writes with memory addresses
				//if (value <= 0x1F)
				//	return [ true, value + 0x20 ];
				extra_words.push(value);
				return [ true, 0x1F ];

			// Add a label patch note for the literal
			case (dcpuTokens.LABEL):
				this.AddLabelPatch(value, 1 + extra_words.length);
				extra_words.push(0);
				return [ true, 0x1F ];

			// This is quite complicated...
			case (dcpuTokens.LBRACKET):
				return this.ParseAddressArgument(extra_words);

			case (dcpuTokens.INVALID):
			case (dcpuTokens.END):
			default:
				this.Report.UnexpectedToken(token[0], this.Line);
				return [ false, 0 ];
		}

		return [ true, 0 ];
	}


	this.ParseInstruction = function(token)
	{
		// Start off with the opcode
		var word = token[1];
		var extra_words = [ ];

		// Inline data definition
		if (word == dcpuOpcodes.DAT)
		{
			while (true)
			{
				// Check for exit
				token = this.Lexer.NextToken();
				if (token[0] == dcpuTokens.END)
					break;
				if (token[0] == dcpuTokens.INVALID)
				{
					this.Report.UnexpectedToken(token[0], this.Line);
					break;
				}

				// Push directly into byte-code depending upon the token type
				var value = token[1];
				switch (token[0])
				{
					case (dcpuTokens.NUMBER):
						this.WordCode.push(value);
						break;

					case (dcpuTokens.STRING):
						for (var i in value)
							this.WordCode.push(value.charCodeAt(i));
						break;
				}
			}
		}

		else
		{
			// Is this a complex opcode?
			if ((word & 0xF) == 0)
			{
				// Parse the single argument
				var extra_words = [ ];
				var a = this.ParseArgument(extra_words);
				if (!a[0])
					return false;

				// Merge instruction details
				word |= a[1] << 10;
			}

			else
			{
				// Parse both arguments				
				var a = this.ParseArgument(extra_words);
				if (!a[0])
					return false;
				var token = this.Lexer.NextToken();
				if (token[0] != dcpuTokens.COMMA)
				{
					this.Report.ExpectingToken(dcpuTokens.COMMA, token[0], this.Line);
					return false;
				}
				var b = this.ParseArgument(extra_words);
				if (!b[0])
					return false;

				// Merge instruction details
				word |= a[1] << 4;
				word |= b[1] << 10;
			}

			// Add to the generated code
			this.WordCode.push(word);
			for (var j in extra_words)
				this.WordCode.push(extra_words[j]);
		}
	}


	this.Assemble = function(asm)
	{
		this.Lexer = new dcpuLexer(this.Report);

		// Split into lines and run the lexer on them individually
		var lines = asm.split("\n");
		for (var i in lines)
		{
			this.Line = parseInt(i) + 1;
			this.Lexer.SetText(lines[i], this.Line);
			var token = this.Lexer.NextToken();

			switch (token[0])
			{
				// Skip comments and empty lines
				case (dcpuTokens.SEMICOLON):
				case (dcpuTokens.END):
					continue;

				// Only accept labels and instructions
				case (dcpuTokens.COLON):
					this.ParseLabel();
					continue;
				case (dcpuTokens.INSTRUCTION):
					this.ParseInstruction(token);
					break;

				default:
					this.Report.UnexpectedToken(token[0], this.Line);
					break;
			}

			// Catch any trailing characters
			token = this.Lexer.NextToken();
			if (token[0] != dcpuTokens.END && token[0] != dcpuTokens.SEMICOLON)
				this.Report.Error("End of line expected", this.Line);
		}

		// Patch up all label references
		for (var i in this.LabelPatches)
		{
			var patch = this.LabelPatches[i];

			// Ensure the labels exist first!
			var label_name = patch[0];
			if (!(label_name in this.Labels))
			{
				this.Report.Error("Unresolved reference to label '" + label_name + "'", patch[2]);
				continue;
			}

			// Set the offset in the byte code
			var label_offset = this.Labels[label_name];
			var reference_offset = patch[1];
			this.WordCode[reference_offset] = label_offset;
		}
	}
}



// =====================================================================================================================
// DCPU-16 Emulator
// =====================================================================================================================



function dcpuEmulator()
{
	this.Reset = function()
	{
		// Registers are mapped to >128k memory to make emulator code a little easier
		this.WordMem = new Array(0x10000 + 8 + 3);
		this.Registers = 0x10000;
		this.PC = this.Registers + 8 + 0;
		this.SP = this.Registers + 8 + 1;
		this.O  = this.Registers + 8 + 2;

		// Reset registers
		this.WordMem[this.PC] = 0;
		this.WordMem[this.SP] = 0xFFFF;
		this.WordMem[this.O] = 0;

		// I can't believe I'm doing this... is there a better way?
		for (var i = 0; i < this.WordMem.length; i++)
			this.WordMem[i] = 0;
		this.CodeLength = 0;
	}


	// Initial reset on create
	this.Reset();


	this.UploadCode = function(word_code)
	{
		this.Reset();

		// Copy each word manually
		this.CodeLength = word_code.length;
		for (var i = 0; i < this.CodeLength; i++)
		{
			var word = word_code[i];
			this.WordMem[i] = word;
		}
	}


	this.DecodeArgumentAddr = function(instr, shift)
	{
		// Get the correct argument
		var arg = (instr >> shift) & 0x3F;

		// Memory and registers are part of the same memory map, allowing this single function to return
		// the address of both source and destinaton operands.

		// Register values and immediate values in the code segment
		if (arg < 0x08)
			return this.Registers + arg;
		if (arg < 0x10)
			return this.WordMem[this.Registers + (arg - 0x08)];
		if (arg < 0x18)
			return this.WordMem[this.WordMem[this.PC]++] + this.WordMem[this.Registers + (arg - 0x10)];

		// Stack values that CAN NOT be used as address operands; this is implied by the instruction
		if (arg == dcpuRegisters.POP)
			return this.WordMem[this.SP]++;
		if (arg == dcpuRegisters.PEEK)
			return this.WordMem[this.SP];
		if (arg == dcpuRegisters.PUSH)
			return --this.WordMem[this.SP];

		// Raw control register values
		if (arg == dcpuRegisters.SP)
			return this.SP;
		if (arg == dcpuRegisters.PC)
			return this.PC;
		if (arg == dcpuRegisters.O)
			return this.O;

		// Using immediate values as address operands
		if (arg == 0x1E)
			return this.WordMem[this.WordMem[this.PC]++];

		// This is for immediate values. The spec mentions that writing to an immediate silently fails
		// whereas this code will effectively write to the code segment.
		if (arg == 0x1F)
			return this.WordMem[this.PC]++

		// TODO: 5-bit compact immediate values! (add another variable at the end of the mmap and use that)
	}


	this.SetO = function(o)
	{
		this.WordMem[this.O] = o & 0xFFFF;
	}


	// Simple instructions listed by index using their opcode - brittle but fast
	this.SimpleInstructions = [
		null,
		function(a, b) { return b; },
		function(a, b) { var r = a + b; this.SetO(r > 0xFFFF ? 1 : 0); return r; },
		function(a, b) { var r = a - b; this.SetO(r < 0 ? 0xFFFF : 0); return r < 0 ? r + 0xFFFF : r; },
		function(a, b) { var r = a * b; this.SetO(r >> 16); return r; },
		function(a, b) { if (b == 0) { this.SetO(0); return 0; } var r = a / b; this.SetO((a << 16) / b); return r; },
		function(a, b) { var r = b == 0 ? 0: a % b; return r; },
		function(a, b) { var r = a << b; this.SetO(r >> 16); return r; },
		function(a, b) { var r = a >> b; this.SetO((a << 16) >> b); return r; },
		function(a, b) { return a & b; },
		function(a, b) { return a | b; },
		function(a, b) { return a ^ b; },
		function(a, b) { if (a != b) this.SkipNextInstruction = true; },
		function(a, b) { if (a == b) this.SkipNextInstruction = true; },
		function(a, b) { if (a <= b) this.SkipNextInstruction = true; },
		function(a, b) { if ((a & b) == 0) this.SkipNextInstruction = true; }
	]


	this.SimpleOp = function(instr, op)
	{
		// Decode both arguments (forwards PC appropriately)
		var a = this.DecodeArgumentAddr(instr, 4);
		var b = this.DecodeArgumentAddr(instr, 10);

		if (this.SkipNextInstruction)
		{
			this.SkipNextInstruction = false;
		}

		else
		{
			// Run the instruction and commit any needed results to the first argument
			var r = op.apply(this, [ this.WordMem[a], this.WordMem[b] ]);
			if (r != null)
				this.WordMem[a] = r & 0xFFFF;
		}
	}


	this.JSR = function(instr)
	{
		// Decode the only argument
		var a = this.DecodeArgumentAddr(instr, 10);

		if (this.SkipNextInstruction)
		{
			this.SkipNextInstruction = false;
		}

		else
		{
			// Push address of next instruction
			var pc = this.WordMem[this.PC];
			this.WordMem[--this.WordMem[this.SP]] = pc;

			// Jump to subroutine
			this.WordMem[this.PC] = this.WordMem[a];
		}
	}


	this.DecodeInstruction = function()
	{
		// Don't execute into the ether!
		if (this.WordMem[this.PC] >= this.CodeLength)
			return;

		var instr = this.WordMem[this.WordMem[this.PC]++];

		// Decode and execute simple instructions
		var simple_op = instr & 0xF;
		if (this.SimpleInstructions[simple_op])
			this.SimpleOp(instr, this.SimpleInstructions[simple_op]);

		// Only one complex op for the moment but that will no doubt change at a later date - update then
		else if ((instr & 0xF0000) == dcpuOpcodes.JSR)
			this.JSR(instr);
	}


	this.UploadCharacterSet = function(image)
	{
		// Create a canvas and blit the image into that
		var buffer = document.createElement("canvas");
		buffer.width = image.width;
		buffer.height = image.height;
		var ctx = buffer.getContext("2d");
		ctx.drawImage(image, 0, 0);

		// Get access to the pixels
		var image_data = ctx.getImageData(0, 0, buffer.width, buffer.height);
		var data = image_data.data;

		// This one nasty big hack but I'm too tired now
		// Will clean it up later...
		for (var i = 0; i < buffer.width; i += 4)
		{
			var w = 0;
			for (var y = 0; y < 8; y++)
			{
				var p = data[y * buffer.width * 4 + i * 4 + 0 * 4];
				p = (p ? 0 : 1);
				w |= (1 << y) * p;
			}
			for (var y = 0; y < 8; y++)
			{
				var p = data[y * buffer.width * 4 + i * 4 + 1 * 4];
				p = (p ? 0 : 1);
				w |= (1 << (y+8)) * p;
			}

			this.WordMem[0x9000 + (32 + i / 4) * 2] = w;

			var w = 0;
			for (var y = 0; y < 8; y++)
			{
				var p = data[y * buffer.width * 4 + i * 4 + 2 * 4];
				p = (p ? 0 : 1);
				w |= (1 << y) * p;
			}
			for (var y = 0; y < 8; y++)
			{
				var p = data[y * buffer.width * 4 + i * 4 + 3 * 4];
				p = (p ? 0 : 1);
				w |= (1 << (y+8)) * p;
			}

			this.WordMem[0x9000 + (32 + i / 4) * 2 + 1] = w;
		}
	}


	function DrawColumn(data, po, line_width, c)
	{
		for (var i = 0; i < 8; i++)
		{
			if (c & 1)
			{
				data[po+0] = 0x33;
				data[po+1] = 0x66;
				data[po+2] = 0xFF;
			}
			po += line_width;
			c >>= 1;
		}
	}


	this.GenerateVideoBuffer = function()
	{
		// Create the video buffer canvas on demand
		if (!this.VideoBuffer)
		{
			this.VideoBuffer = document.createElement("canvas");
			this.VideoBuffer.width = 30 * 4;
			this.VideoBuffer.height = 10 * 8;
			this.VideoBuffer.Ctx = this.VideoBuffer.getContext("2d");
		}

		var w = this.VideoBuffer.width;
		var h = this.VideoBuffer.height;
		this.VideoBuffer.Ctx.fillStyle = "#000025";
		this.VideoBuffer.Ctx.fillRect(0, 0, w, h);

		var image_data = this.VideoBuffer.Ctx.getImageData(0, 0, w, h);
		var data = image_data.data;

		var line_width = w * 8 * 4;
		var char_width = 4 * 4;

		for (var y = 0, i = 0, po = 0; y < h; y += 8, po += line_width)
		{
			for (var x = 0; x < w; x += 4, i++, po += char_width)
			{
				var ccode = Emulator.WordMem[0x8000 + i] & 0x7F
				if (ccode)
				{
					// Locate the two words defining the character
					var coffs = 0x9000 + ccode * 2;
					var w0 = Emulator.WordMem[coffs + 0];
					var w1 = Emulator.WordMem[coffs + 1];

					// Split into the 4 columns and draw
					DrawColumn(data, po, w * 4, w0 & 0xFF);
					DrawColumn(data, po + 4, w * 4, w0 >> 8);
					DrawColumn(data, po + 8, w * 4, w1 & 0xFF);
					DrawColumn(data, po + 12, w * 4, w1 >> 8);
				}
			}
		}

		this.VideoBuffer.Ctx.putImageData(image_data, 0 , 0);
		return this.VideoBuffer;
	}
}